#!/bin/bash

# Proxilion Enterprise Deployment Script
# Automates production deployment for enterprise environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROXILION_DIR="/opt/proxilion"
CERT_DIR="/opt/proxilion/certs"
CONFIG_DIR="/etc/proxilion"
LOG_DIR="/var/log/proxilion"
SERVICE_USER="proxilion"
PROXILION_PORT=8787
ADMIN_PORT=8788

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Proxilion Enterprise Deployment     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Error: This script must be run as root${NC}"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo -e "${RED}Error: Cannot detect OS${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Detected OS: $OS $VERSION"

# Step 1: Install dependencies
echo ""
echo -e "${BLUE}[1/9] Installing dependencies...${NC}"

case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y curl git nodejs npm nginx openssl
        ;;
    centos|rhel|fedora)
        yum install -y curl git nodejs npm nginx openssl
        ;;
    *)
        echo -e "${YELLOW}Warning: Unsupported OS. Please install dependencies manually.${NC}"
        ;;
esac

echo -e "${GREEN}✓${NC} Dependencies installed"

# Step 2: Create service user
echo ""
echo -e "${BLUE}[2/9] Creating service user...${NC}"

if id "$SERVICE_USER" &>/dev/null; then
    echo -e "${YELLOW}User $SERVICE_USER already exists${NC}"
else
    useradd -r -s /bin/false -d $PROXILION_DIR $SERVICE_USER
    echo -e "${GREEN}✓${NC} Created user: $SERVICE_USER"
fi

# Step 3: Create directories
echo ""
echo -e "${BLUE}[3/9] Creating directories...${NC}"

mkdir -p $PROXILION_DIR
mkdir -p $CERT_DIR
mkdir -p $CERT_DIR/domains
mkdir -p $CONFIG_DIR
mkdir -p $LOG_DIR

chown -R $SERVICE_USER:$SERVICE_USER $PROXILION_DIR
chown -R $SERVICE_USER:$SERVICE_USER $CERT_DIR
chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR

echo -e "${GREEN}✓${NC} Directories created"

# Step 4: Install Proxilion
echo ""
echo -e "${BLUE}[4/9] Installing Proxilion...${NC}"

cd $PROXILION_DIR

# Install from npm or copy from source
if [ -f "package.json" ]; then
    npm install --production
    npm run build
else
    echo -e "${YELLOW}Please copy Proxilion source to $PROXILION_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Proxilion installed"

# Step 5: Generate certificates
echo ""
echo -e "${BLUE}[5/9] Generating SSL certificates...${NC}"

cd $CERT_DIR

if [ ! -f "ca-cert.pem" ]; then
    # Generate CA certificate
    openssl genrsa -out ca-key.pem 4096
    openssl req -new -x509 -days 3650 -key ca-key.pem -out ca-cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=Proxilion Root CA"

    chmod 600 ca-key.pem
    chown $SERVICE_USER:$SERVICE_USER ca-key.pem ca-cert.pem

    echo -e "${GREEN}✓${NC} Certificates generated"
    echo -e "${YELLOW}⚠${NC}  CA certificate: $CERT_DIR/ca-cert.pem"
else
    echo -e "${YELLOW}CA certificate already exists${NC}"
fi

# Step 6: Configure systemd service
echo ""
echo -e "${BLUE}[6/9] Configuring systemd service...${NC}"

cat > /etc/systemd/system/proxilion.service <<EOF
[Unit]
Description=Proxilion AI Security Proxy
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROXILION_DIR
Environment="NODE_ENV=production"
Environment="CONFIG_PATH=$CONFIG_DIR/config.json"
ExecStart=/usr/bin/node $PROXILION_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/proxilion.log
StandardError=append:$LOG_DIR/proxilion-error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LOG_DIR $CERT_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proxilion

echo -e "${GREEN}✓${NC} Systemd service configured"

# Step 7: Configure firewall
echo ""
echo -e "${BLUE}[7/9] Configuring firewall...${NC}"

if command -v ufw &> /dev/null; then
    ufw allow $PROXILION_PORT/tcp
    ufw allow $ADMIN_PORT/tcp
    ufw allow 443/tcp
    echo -e "${GREEN}✓${NC} UFW rules added"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=$PROXILION_PORT/tcp
    firewall-cmd --permanent --add-port=$ADMIN_PORT/tcp
    firewall-cmd --permanent --add-port=443/tcp
    firewall-cmd --reload
    echo -e "${GREEN}✓${NC} Firewalld rules added"
else
    echo -e "${YELLOW}Warning: No firewall detected. Please configure manually.${NC}"
fi

# Step 8: Create production configuration
echo ""
echo -e "${BLUE}[8/9] Creating production configuration...${NC}"

cat > $CONFIG_DIR/config.json <<EOF
{
  "proxy": {
    "port": $PROXILION_PORT,
    "host": "0.0.0.0",
    "timeout": 30000
  },
  "admin": {
    "port": $ADMIN_PORT,
    "enableAuth": true
  },
  "certificates": {
    "caKeyPath": "$CERT_DIR/ca-key.pem",
    "caCertPath": "$CERT_DIR/ca-cert.pem",
    "certDir": "$CERT_DIR/domains",
    "certValidityDays": 365,
    "autoRotate": true
  },
  "security": {
    "enablePIIScanning": true,
    "enableComplianceScanning": true,
    "blockOnCritical": true,
    "enabledStandards": ["hipaa", "pci_dss", "sox", "glba", "ccpa", "gdpr"]
  },
  "logging": {
    "level": "info",
    "directory": "$LOG_DIR",
    "maxFiles": 30,
    "maxSize": "100m"
  },
  "performance": {
    "enableCaching": true,
    "cacheSize": 104857600,
    "enableRateLimiting": true,
    "maxRequestsPerMinute": 1000
  }
}
EOF

chown $SERVICE_USER:$SERVICE_USER $CONFIG_DIR/config.json
chmod 640 $CONFIG_DIR/config.json

echo -e "${GREEN}✓${NC} Configuration created"

# Step 9: Setup log rotation
echo ""
echo -e "${BLUE}[9/9] Configuring log rotation...${NC}"

cat > /etc/logrotate.d/proxilion <<EOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 $SERVICE_USER $SERVICE_USER
    sharedscripts
    postrotate
        systemctl reload proxilion > /dev/null 2>&1 || true
    endscript
}
EOF

echo -e "${GREEN}✓${NC} Log rotation configured"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment Complete!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo -e "1. Start Proxilion:"
echo -e "   ${YELLOW}sudo systemctl start proxilion${NC}"
echo ""
echo -e "2. Check status:"
echo -e "   ${YELLOW}sudo systemctl status proxilion${NC}"
echo ""
echo -e "3. View logs:"
echo -e "   ${YELLOW}sudo journalctl -u proxilion -f${NC}"
echo ""
echo -e "4. Distribute CA certificate to all client devices:"
echo -e "   ${YELLOW}$CERT_DIR/ca-cert.pem${NC}"
echo ""
echo -e "5. Configure DNS to route AI traffic:"
echo -e "   ${YELLOW}chat.openai.com → $(hostname -I | awk '{print $1}')${NC}"
echo -e "   ${YELLOW}claude.ai → $(hostname -I | awk '{print $1}')${NC}"
echo -e "   ${YELLOW}gemini.google.com → $(hostname -I | awk '{print $1}')${NC}"
echo ""
echo -e "6. Access admin dashboard:"
echo -e "   ${YELLOW}http://$(hostname -I | awk '{print $1}'):$ADMIN_PORT${NC}"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo -e "  - Certificate Installation: docs/CERTIFICATE_INSTALLATION.md"
echo -e "  - DNS Configuration: docs/DNS_CONFIGURATION.md"
echo -e "  - Transparent Proxy Setup: docs/TRANSPARENT_PROXY_SETUP.md"
echo ""

