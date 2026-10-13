export const taskDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const isTemporaryRequestError=error=>Boolean(error?.retryable||['TypeError','TimeoutError','AbortError'].includes(error?.name)||[408,429,500,502,503,504].includes(error?.status));

// Retry reads only. A failed read says nothing about whether paid work succeeded.
export async function readWithRetry(read,{delay=taskDelay,retries=3}={}){
 for(let attempt=0;;attempt++){
  try{return await read();}
  catch(error){if(!isTemporaryRequestError(error)||attempt>=retries)throw error;await delay(Math.min(1000*2**attempt,5000));}
 }
}
