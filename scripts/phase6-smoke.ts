import { io } from "socket.io-client";

async function main() {
  const seen: string[] = [];
  const socket = io("http://localhost:4000", { transports: ["websocket"] });

  for (const name of ["overlay.connected", "widget.triggered", "tts.queued", "tts.speak", "tts.completed", "widget.completed"]) {
    socket.on(name, () => seen.push(name));
  }

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      socket.emit("overlay.join", { token: "demo_overlay_token_phase2" }, () => resolve());
    });
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket timeout")), 5000);
  });

  const loginRes = await fetch("http://localhost:4000/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "demo@example.com", password: "password123" })
  });
  const login = (await loginRes.json()) as { accessToken: string };

  await fetch("http://localhost:4000/mock-events/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${login.accessToken}`
    },
    body: JSON.stringify({ username: "socket", message: "!hello" })
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));
  socket.close();

  console.log(seen.join(","));

  for (const event of ["overlay.connected", "widget.triggered", "tts.queued", "tts.speak"]) {
    if (!seen.includes(event)) {
      throw new Error(`Missing realtime event: ${event}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
