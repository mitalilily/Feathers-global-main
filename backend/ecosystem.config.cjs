module.exports = {
  apps: [
    {
      name: 'shiplifi-backend',
      cwd: '/srv/shiplifi/current/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
      },
    },
  ],
}
