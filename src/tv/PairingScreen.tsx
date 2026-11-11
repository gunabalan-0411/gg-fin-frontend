import { useEffect, useState } from "react";
import { setBackHandler } from "./bridge";
import { T } from "./text";
import { tvClient } from "./tvClient";

const POLL_MS = 3000;
const RETRY_MS = 5000;

/**
 * An unpaired TV: shows a 6-digit code and waits. Someone logged in on a phone or laptop enters it under Settings > TV; the next poll then
 * hands this TV its token. A code lasts 10 minutes - when it runs out (or the network drops) a new one is fetched by itself.
 */
export default function PairingScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => { setBackHandler(null); }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const begin = async () => {
      try {
        const { data } = await tvClient.pairStart();
        if (!alive) return;
        setCode(data.code);
        setOffline(false);
        poll(data.poll_id, Date.now() + data.expires_in * 1000);
      } catch {
        if (!alive) return;
        setOffline(true);
        timer = setTimeout(begin, RETRY_MS);
      }
    };
    const poll = (pollId: string, until: number) => {
      timer = setTimeout(async () => {
        try {
          const { data } = await tvClient.pairPoll(pollId);
          if (!alive) return;
          if (data.status === "approved") { onPaired(data.token); return; }
          if (data.status === "expired" || Date.now() > until) { begin(); return; }
          setOffline(false);
        } catch {
          if (!alive) return;
          setOffline(true);
        }
        poll(pollId, until);
      }, POLL_MS);
    };

    begin();
    return () => { alive = false; clearTimeout(timer); };
  }, [onPaired]);

  return (
    <div className="tv-full pair">
      <div className="brandrow"><div className="logo">GG</div><div className="brandname ta">{T.brand}</div></div>
      <h1 className="ta">{T.pairTitle}</h1>
      <div className="code num" data-testid="tv-code">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : "··· ···"}</div>
      <ol className="steps ta">{T.pairSteps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className={`wait ta${offline ? " bad" : ""}`}>{offline ? T.pairError : T.pairWaiting}</div>
    </div>
  );
}
