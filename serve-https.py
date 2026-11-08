# Serve this folder over HTTPS on your Wi-Fi so a phone can use its camera.
# Phones only allow camera access on https:// (or localhost), so plain http://<ip> won't work.
# Run:  python serve-https.py   then open https://<this-PC-IP>:8443 on the phone (same Wi-Fi).
# Uses the self-signed certificate in .cert/ (the phone will warn once; choose "Advanced" -> "Proceed").
import http.server, ssl, socket, os

PORT = int(os.environ.get("HTTPS_PORT", "8443"))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the Wi-Fi interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()

import subprocess, sys
ip = lan_ip()
if not os.path.exists(".cert/cert.pem"):  # first run: make a self-signed cert for this PC's Wi-Fi IP
    os.makedirs(".cert", exist_ok=True)
    try:
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
                        "-keyout", ".cert/key.pem", "-out", ".cert/cert.pem", "-subj", "/CN=diwali-local",
                        "-addext", f"subjectAltName=IP:{ip},DNS:localhost"], check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as e:
        sys.exit(f"Could not create a certificate with openssl ({e}). Install OpenSSL (it ships with Git for Windows) and retry.")

httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(".cert/cert.pem", ".cert/key.pem")
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"Open on your phone (same Wi-Fi):  https://{ip}:{PORT}")
httpd.serve_forever()
