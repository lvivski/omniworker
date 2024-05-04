interface OmniWorkerOptions extends WorkerOptions {
	shared?: boolean
}

interface OmniWorkerInterface {
	new <T extends OmniWorkerOptions>(scriptUrl: string | URL, options?: T): T['shared'] extends true
		? SharedWorker
		: Worker
}

declare var self: Worker & typeof globalThis

function OmniWorkerTemplate(scriptUrl: string): void {
	self.onunhandledrejection = e => {
		e.preventDefault()
		throw e.reason
	}

	const messageQueue: Event[] = []
	self.addEventListener('message', queueMessage)

	setTimeout(loadScript)

	function loadScript(): void {
		importScripts(scriptUrl)
		self.removeEventListener('message', queueMessage)
		messageQueue.forEach(event => self.dispatchEvent(event))
	}

	function queueMessage(event: MessageEvent): void {
		messageQueue.push(event)
	}
}

class OmniWorker {
	constructor(scriptUrl: string | URL, options?: OmniWorkerOptions) {
		const name = scriptUrl.toString().split('/').pop()
		const workerTemplate = `(${OmniWorkerTemplate.toString()})(${JSON.stringify(scriptUrl)});`
		const type = 'application/javascript'

		let worker: Worker | SharedWorker
		if (options?.shared) {
			worker = new SharedWorker(`data:${type};base64,` + btoa(workerTemplate), { name, ...options })
		} else {
			const objectUrl = URL.createObjectURL(new Blob([workerTemplate], { type }))
			worker = new Worker(objectUrl, { name, ...options })
			URL.revokeObjectURL(objectUrl)
		}
		return worker
	}
}

export default OmniWorker as OmniWorkerInterface
