declare module "inflight" {

  function inflight<T>(key: string, v: T): T;

  export default inflight;
}
