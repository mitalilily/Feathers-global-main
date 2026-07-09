module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'feathers-global-backend',
      cwd: __dirname,
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5003,
      },
    },
  ],
}
