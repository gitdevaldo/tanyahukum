module.exports = {
  apps: [
    {
      name: "th-api",
      cwd: "/root/tanyahukum",
      script: "python3",
      args: "-m uvicorn api.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 300",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "th-web",
      cwd: "/root/tanyahukum/web",
      script: "npx",
      args: "next start -p 3010 -H 127.0.0.1",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=512",
      },
    },
  ],
};
