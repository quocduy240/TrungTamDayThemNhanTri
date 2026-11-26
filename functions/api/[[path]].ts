import worker, { type WorkerEnv } from '../../worker/index.ts';

interface PagesContext {
  request: Request;
  env: WorkerEnv;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return worker.fetch(context.request, context.env);
}
