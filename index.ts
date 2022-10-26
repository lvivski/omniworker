interface OmniWorkerOptions extends WorkerOptions {
	shared?: boolean
}

interface OmniWorkerInterface {
	new <T extends OmniWorkerOptions>(scriptUrl: string | URL, options?: T): T['shared'] extends true
		? SharedWorker
		: Worker
}

class OmniWorker {
	constructor(scriptUrl: string | URL, options?: OmniWorkerOptions) {
		const name = scriptUrl.toString().split('/').pop()
		const workerTemplate = `importScripts(${JSON.stringify(scriptUrl)});`
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
