type WrappableFunction = (...args: any[]) => Promise<any> | void

type Wrappable = WrappableFunction | { [key: string]: WrappableFunction }

type WrappedArg<T> = T extends WrappableFunction ? MessagePort : T

type WrappedFunction<T> = T extends (...args: infer A) => infer R
	? (...args: { [K in keyof A]: WrappedArg<A[K]> }) => Promise<Awaited<R>>
	: never

type WrappedObject<T> = {
	[K in keyof T]: WrappedFunction<T[K]>
}

type Wrapped<T> = WrappedFunction<T> | WrappedObject<T>

type Transport = MessagePort | Worker

const enum MessageType {
	Invoke = 'invoke',
	IgnoreResult = 'ignore',
	Return = 'return',
}

export function wrap<T extends Transport>(obj: T): Wrapped<T>
export function wrap<T extends Wrappable>(obj: T, transport?: Transport): Transport
export function wrap<T>(obj: Wrappable, transport?: Transport) {
	if (obj instanceof MessagePort || obj instanceof Worker) {
		if (transport) {
			throw new TypeError('Cannot pass a transport while wrapping a transport')
		}
		return listen<T>(obj)
	}

	let result = transport

	if (!transport) {
		const { port1, port2 } = new MessageChannel()
		transport = port1
		result = port2
	}

	expose(obj, transport)
	return result
}

export const ignoreResult = Symbol('ignoreResult')

type Deferred<T> = {
	resolve: (value: T) => void
	reject: (error: Error) => void
}

const registry = new WeakMap<Transport, Map<string, Deferred<any>>>()

function listen<T>(transport: Transport): Wrapped<T> {
	transport.addEventListener('message', e => {
		const event = e as MessageEvent
		const { id, type, value, error } = event.data
		if (type === MessageType.Return) {
			const deferred = registry.get(transport)?.get(id)
			if (!deferred) {
				throw new TypeError(`Invalid message id: ${id}`)
			}
			if (error) {
				deferred.reject(error)
			} else {
				deferred.resolve(value)
			}
		}
	})

	return proxy<T>(transport)
}

function proxy<T>(transport: Transport, path: (string | symbol)[] = []): Wrapped<T> {
	return new Proxy(() => {}, {
		get(_target, prop) {
			if (prop === 'then') {
				return undefined
			}
			return proxy(transport, [...path, prop])
		},
		apply(_target, context, args) {
			return new Promise((resolve, reject) => {
				const id = Math.random().toString(36).slice(2)
				const type = context?.[ignoreResult] ? MessageType.IgnoreResult : MessageType.Invoke

				if (type === MessageType.Invoke) {
					const deferred = { resolve, reject }
					const map = registry.get(transport) ?? new Map<string, Deferred<any>>()
					map.set(id, deferred)
					registry.set(transport, map)
				}
				transport.postMessage(
					{
						id,
						type,
						path,
						args,
					},
					args.filter(isTransferrable)
				)
				if (type === MessageType.IgnoreResult) {
					resolve(undefined)
				}
			})
		},
	}) as Wrapped<T>
}

type Transferrable = ArrayBuffer | MessagePort

function isTransferrable(value: any): value is Transferrable {
	return value instanceof ArrayBuffer || value instanceof MessagePort
}

function expose(obj: Wrappable, transport: Transport) {
	transport.addEventListener('message', e => {
		const event = e as MessageEvent
		const { id, type, path = [], args: rawArgs = [] } = event.data
		if (type === MessageType.Invoke || type === MessageType.IgnoreResult) {
			let result
			try {
				const method = atPath(obj, path)
				if (typeof method !== 'function') {
					throw new TypeError(`Cannot call non-function at: ${path.join('.')}`)
				}
				const context = atPath(obj, path.slice(0, -1))
				const args = rawArgs.map(arg => (arg instanceof MessagePort ? listen(arg) : arg))
				result = method.apply(context, args)
			} catch (error) {
				if (!id) {
					throw error
				}
				result = Promise.reject(error)
			}

			if (type === MessageType.Invoke) {
				Promise.resolve(result).then(
					value => transport.postMessage({ id, type: MessageType.Return, value }),
					error => transport.postMessage({ id, type: MessageType.Return, error })
				)
			}
		}
	})

	if ('start' in transport) {
		transport.start()
	}
}

function atPath(obj: Wrappable, path: string[]): Wrappable {
	return path.reduce((acc, key) => {
		if (acc && typeof acc === 'object' && key in acc) {
			return acc[key]
		}
		throw new TypeError(`Invalid path: ${path.join('.')}`)
	}, obj)
}
