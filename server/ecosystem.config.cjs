module.exports = {
  apps: [
    {
      name: 'organizer-api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],

  deploy: {
    production: {
      // Connexion SSH
      user: 'root',
      host: '51.210.150.25',
      ref: 'origin/main',

      // Repo Git
      repo: 'https://github.com/micktaiwan/organizer.git',

      // Dossier sur le serveur
      path: '/var/www/organizer',

      // Commandes après git pull
      'pre-deploy-local': '',
      'post-deploy': 'cd server && npm install && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': '',

      // Variables d'environnement
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
