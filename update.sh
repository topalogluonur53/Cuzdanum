#!/usr/bin/env bash
# Cüzdanım - Raspberry Pi & CasaOS Güncelleme Betiği
set -e

echo "=========================================="
echo "    Cüzdanım Güncelleme Başlatılıyor...  "
echo "=========================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "1. Git deposundan güncellemeler alınıyor..."
git pull

echo "2. Docker imajı yeniden derleniyor ve konteyner güncelleniyor..."
docker compose up -d --build

echo "3. Eski artık imajlar temizleniyor..."
docker image prune -f

echo "=========================================="
echo "✅ Güncelleme tamamlandı!"
echo "Uygulama aktif: http://$(hostname -I | awk '{print $1}'):8686"
echo "=========================================="
