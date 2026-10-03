"""Tiny CDP driver: cdp.py <url> <out.png> [js-before-shot] [wait_s] [width] [height]"""
import base64, json, sys, time, urllib.request
import websocket

url, out = sys.argv[1], sys.argv[2]
js = sys.argv[3] if len(sys.argv) > 3 else ""
wait = float(sys.argv[4]) if len(sys.argv) > 4 else 2.5
w = int(sys.argv[5]) if len(sys.argv) > 5 else 1400
h = int(sys.argv[6]) if len(sys.argv) > 6 else 1400
tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9333/json"))
tab = [t for t in tabs if t["type"] == "page"][0]
ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=60, suppress_origin=True)
n = [0]
logs = []


def call(method, **params):
    n[0] += 1
    ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
    while True:
        m = json.loads(ws.recv())
        if m.get("method") in ("Runtime.consoleAPICalled", "Runtime.exceptionThrown"):
            logs.append(m)
        if m.get("id") == n[0]:
            return m.get("result", m.get("error"))


call("Runtime.enable")
call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=w < 600)
call("Page.navigate", url=url)
time.sleep(wait)
if js:
    r = call("Runtime.evaluate", expression=js, returnByValue=True, awaitPromise=True)
    print("JS:", json.dumps(r.get("result", r))[:1500])
    time.sleep(1.2)
shot = call("Page.captureScreenshot", format="png", captureBeyondViewport=True)
open(out, "wb").write(base64.b64decode(shot["data"]))
for m in logs:
    p = m["params"]
    if m["method"] == "Runtime.exceptionThrown":
        print("EXC:", json.dumps(p["exceptionDetails"])[:600])
    else:
        print("LOG:", p["type"], [a.get("value", a.get("description")) for a in p["args"]][:3])
print("ok", out)
