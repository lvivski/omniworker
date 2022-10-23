interface OmniWorkerOptions extends WorkerOptions {
	shared?: boolean;
}

interface OmniWorkerInterface {
	new <T extends OmniWorkerOptions>(scriptUrl: string | URL, options?: T): T["shared"] extends true
		? SharedWorker
		: Worker;
}

class OmniWorker {
	constructor(scriptUrl: string | URL, options?: OmniWorkerOptions) {
		const name = scriptUrl.toString().split("/").pop();
		const objectUrl = URL.createObjectURL(
			new Blob([`importScripts(${JSON.stringify(scriptUrl)});`], { type: "application/javascript" })
		);
		const WorkerClass = options?.shared ? SharedWorker : Worker;
		const worker = new WorkerClass(objectUrl, { name, ...options });
		URL.revokeObjectURL(objectUrl);
		return worker;
	}
}

export default OmniWorker as OmniWorkerInterface;
