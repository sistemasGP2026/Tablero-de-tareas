// PM2: pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: "tablero-tareas",
      script: "src/server.js",
      cwd: __dirname,
      max_memory_restart: "200M",
      env: { NODE_ENV: "production" },
    },
  ],
};
