# Deploy runbook — mail core (subsystem 1)

## One-time setup

```bash
sudo useradd -r -m -d /var/lib/crm crm
sudo mkdir -p /etc/crm /var/lib/crm/attachments
sudo chown -R crm:crm /var/lib/crm

# secrets
sudo tee /etc/crm/secrets.env >/dev/null <<EOF
DATABASE_URL=postgresql://crm:STRONG_PASSWORD@localhost:5432/crm
REDIS_URL=redis://localhost:6379
CRM_ENC_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
ATTACHMENT_DIR=/var/lib/crm/attachments
PORT=3000
NODE_ENV=production
EOF
sudo chown crm:crm /etc/crm/secrets.env
sudo chmod 600 /etc/crm/secrets.env

# postgres
sudo -u postgres createuser crm --pwprompt
sudo -u postgres createdb crm -O crm

# redis
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# build
cd /opt/crm.eg.je
sudo -u crm pnpm install
sudo -u crm pnpm -r build
sudo -u crm DATABASE_URL=postgresql://crm:STRONG_PASSWORD@localhost:5432/crm \
  pnpm --filter @crm/db exec prisma migrate deploy

# units
sudo cp ops/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crm-api crm-sync

# nginx + tls
sudo cp ops/nginx/crm.eg.je.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/crm.eg.je.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d crm.eg.je
sudo nginx -t && sudo systemctl reload nginx

# seed owner
sudo -u crm pnpm --filter @crm/api seed:owner --email=you@example.com --password=...

# seed each mail.ru mailbox
sudo -u crm pnpm --filter @crm/api seed:mailbox \
  --email=tmserviceufa@mail.ru --app-password='...' --name='Главный'
```

## Health

```bash
curl https://crm.eg.je/health   # → {"ok":true}
```

## Logs

```bash
journalctl -u crm-api -f
journalctl -u crm-sync -f
```

## Adding a mailbox after install

Run `seed:mailbox` again with new credentials. The sync worker picks it up on the next restart of `crm-sync` (`sudo systemctl restart crm-sync`).
