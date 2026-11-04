// One bounded first-reveal session. Queue time and other models do not consume a file's
// progress watchdog; a stalled request gets one fresh attempt, never an endless loading veil.
export const ASSET_LOAD_POLICY = Object.freeze({ totalMs: 45000, headerMs: 8000, idleMs: 6000, decodeMs: 10000, attempts: 2 });
const resourceName = url => { try { return new URL(url, 'https://assets.invalid/').pathname; } catch { return 'asset'; } };
export class AssetLoadError extends Error {
  constructor(code, record = {}, cause) {
    super(code, cause ? { cause } : undefined);this.name='AssetLoadError';this.code=code;
    this.detail={code,...record};
  }
}
export const assetFailureDetail = error => {
  const d=error?.detail;
  return d ? `${d.code}; phase=${d.phase||'batch'}${d.resource?`; resource=${d.resource}`:''}${d.attempt?`; attempt=${d.attempt}`:''}${d.bytes!==undefined?`; bytes=${d.bytes}`:''}${d.status?`; HTTP=${d.status}`:''}${d.pending?.length?`; pending=${d.pending.map(p=>`${p.resource}:${p.phase}:${p.bytes}`).join(',')}`:''}` : 'asset-unavailable; phase=unknown';
};
function abortable(promise, signal) {
  if(signal.aborted)return Promise.reject(signal.reason);
  let stop;const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
  return Promise.race([promise,cancelled]).finally(()=>signal.removeEventListener('abort',stop));
}
export function createAssetLoadSession({fetcher=globalThis.fetch,policy=ASSET_LOAD_POLICY,clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}={}) {
  const controller=new AbortController(),sources=new Map(),records=new Map();let closed=false;
  const check=()=>controller.signal.throwIfAborted();
  const abort=error=>{if(!controller.signal.aborted)controller.abort(error);};
  const total=clock.setTimeout(()=>abort(new AssetLoadError('asset-budget-exceeded',{phase:'batch',pending:Array.from(records.values(),r=>({...r})).filter(r=>r.phase!=='ready')})),policy.totalMs);
  const errorFor=(code,record,cause)=>new AssetLoadError(code,{...record},cause);
  async function bytes(url) {
    check();const record={resource:resourceName(url),phase:'headers',attempt:0,bytes:0};records.set(String(url),record);
    for(let attempt=1;attempt<=policy.attempts;attempt++) {
      check();Object.assign(record,{phase:'headers',attempt,bytes:0});delete record.status;
      const request=new AbortController();let timer,reader;
      const cancel=()=>request.abort(controller.signal.reason);
      controller.signal.addEventListener('abort',cancel,{once:true});
      const watch=ms=>{clock.clearTimeout(timer);timer=clock.setTimeout(()=>request.abort(errorFor('asset-stalled',record)),ms);};
      watch(policy.headerMs);
      try {
        const response=await abortable(fetcher(url,{signal:request.signal}),request.signal);check();record.status=response.status;
        if(!response.ok)throw errorFor('asset-http-error',record);
        record.phase='body';watch(policy.idleMs);
        let result;
        if(response.body?.getReader) {
          reader=response.body.getReader();const chunks=[];
          while(true) {
            const chunk=await abortable(reader.read(),request.signal);check();
            if(chunk.done)break;
            if(chunk.value?.byteLength){chunks.push(chunk.value);record.bytes+=chunk.value.byteLength;watch(policy.idleMs);}
          }
          result=new Uint8Array(record.bytes);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.byteLength;}
        } else {
          result=new Uint8Array(await abortable(response.arrayBuffer(),request.signal));check();record.bytes=result.byteLength;
        }
        record.phase='downloaded';return result.buffer;
      } catch(cause) {
        if(controller.signal.aborted)throw controller.signal.reason;
        const error=request.signal.aborted?request.signal.reason:cause instanceof AssetLoadError?cause:errorFor('asset-network-error',record,cause);
        const retryable=['asset-stalled','asset-network-error'].includes(error.code)||(error.code==='asset-http-error'&&(record.status===408||record.status===429||record.status>=500));
        if(attempt>=policy.attempts||!retryable){abort(error);throw error;}
      } finally {
        clock.clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);
        // A pending read/fetch must stop before a retry or a sibling failure can finish.
        request.abort();if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
      }
    }
  }
  async function decode(url,buffer,parse) {
    check();const record=records.get(String(url));record.phase='decode';let timer;
    const deadline=new Promise((_,reject)=>{timer=clock.setTimeout(()=>{const error=errorFor('asset-decode-timeout',record);abort(error);reject(error);},policy.decodeMs);});
    try {
      const result=await abortable(Promise.race([Promise.resolve().then(()=>parse(buffer)),deadline]),controller.signal);check();record.phase='ready';return result;
    } catch(cause) {
      const error=controller.signal.aborted?controller.signal.reason:errorFor('asset-decode-error',record,cause);abort(error);throw error;
    } finally {clock.clearTimeout(timer);}
  }
  function load(url,parse) {
    check();if(closed)throw new Error('Asset loading session is closed');
    const key=String(url);if(!sources.has(key))sources.set(key,bytes(url).then(buffer=>decode(url,buffer,parse)));
    return sources.get(key);
  }
  return {
    load,check,abort,signal:controller.signal,
    json:url=>load(url,buffer=>JSON.parse(new TextDecoder().decode(buffer))),
    snapshot:()=>Array.from(records.values(),r=>({...r})),
    close:()=>{closed=true;clock.clearTimeout(total);},
  };
}
