import { StringDecoder } from 'node:string_decoder';

export function lineStream(onLine) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const drain = () => {
    let at;
    while ((at = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, at).replace(/\r$/, '');
      pending = pending.slice(at + 1);
      onLine(line);
    }
  };
  return {
    write(chunk) { pending += decoder.write(chunk); drain(); },
    end() { pending += decoder.end(); drain(); if (pending) onLine(pending); pending = ''; },
  };
}
