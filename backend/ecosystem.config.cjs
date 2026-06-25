const path = require('path')

module.exports = {
  apps: [
    {
      name: 'feathers-global-backend',
      cwd: path.resolve(__dirname),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5013,
        PM2_APP_NAME: 'feathers-global-backend',
      },
    },
  ],
}
