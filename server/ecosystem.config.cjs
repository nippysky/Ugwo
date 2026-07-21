/**
 * PM2 Ecosystem Config — Ụgwọ API
 *
 * Usage (on the droplet, in /var/www/ugwo-api):
 *   npm run build
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save          # persist across reboots
 *
 * Processes:
 *   ugwo-api — Hono HTTP API server on port 3001 (aku-api owns 3000)
 *
 * No background workers: all Ụgwọ reminders are local notifications
 * scheduled on-device — the server can't read due dates by design.
 */

module.exports = {
  apps: [
    {
      name:         'ugwo-api',
      script:       'dist/index.js',
      instances:    1,
      exec_mode:    'fork',
      env_file:     '.env',
      env_production: {
        NODE_ENV: 'production',
      },
      autorestart:  true,
      watch:        false,
      max_memory_restart: '300M',
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file:     'logs/out.log',
      error_file:   'logs/error.log',
      merge_logs:   true,
    },
  ],
};
