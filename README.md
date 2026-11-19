# 💰 Cüzdanım - Kişisel Finans ve Bütçe Takip Uygulaması

Kişisel bütçenizi, kredi kartı borçlarınızı, taksitli harcamalarınızı, alacak/vereceklerinizi ve anlık piyasa fiyatlarıyla altın/döviz/hisse birikimlerinizi takip edebileceğiniz modern finans uygulaması.

---

## 🍓 Raspberry Pi & CasaOS Kurulumu

Bu proje CasaOS ve Raspberry Pi (ARM64 / ARMv7) ortamları için tam uyumlu Docker altyapısına sahiptir.

### Yöntem 1: Doğrudan Git ve Docker Compose ile Kurulum (Önerilen)

1. **Raspberry Pi'nize SSH ile bağlanın** veya **CasaOS Terminali**'ni açın.
2. Uygulama için dizin oluşturup depoyu klonlayın:
   ```bash
   mkdir -p /DATA/AppData/cuzdanim
   cd /DATA/AppData/cuzdanim
   git clone <REPO_URLINIZ> .
   ```
3. Docker konteynerini derleyip başlatın:
   ```bash
   docker compose up -d --build
   ```
4. Tarayıcınızdan Raspberry Pi IP adresine gidin:
   ```
   http://RASPBERRY_PI_IP:8686
   ```

---

### 🔄 Git'ten Güncelleme Nasıl Yapılır?

Kodunuzda bir değişiklik yapıp Git'e (`git push`) gönderdiğinizde, Raspberry Pi üzerinde güncellemek için:

**Tek Komutla Güncelleme:**
```bash
cd /DATA/AppData/cuzdanim
./update.sh
```

*(Veya manuel olarak: `git pull && docker compose up -d --build && docker image prune -f`)*

Veritabanınız (`data/cuzdanim.db`) Docker volume ile kalıcı olarak saklandığı için güncellemeler sırasında hiçbir veriniz kaybolmaz!

---

### 🏠 CasaOS Panelinde Görünmesini Sağlama

Uygulamanın CasaOS ana panelinde güzel bir simge ve bağlantı ile görünmesi için:

1. **CasaOS Arayüzü**'ne gidin.
2. Sağ üstteki **"+"** simgesine tıklayın -> **"Custom Install (Özel Yükleme)"** seçeneğini seçin.
3. Sağ üstteki **"Import"** butonuna tıklayın.
4. Projedeki `docker-compose.yml` dosyasının içeriğini yapıştırın ve **Submit** deyin.
5. Bilgiler otomatik doldurulacaktır (Simge, Port: 8686, Dizin: `/DATA/AppData/cuzdanim/data`).
6. **Install** butonuna tıklayın. Artık CasaOS ana ekranınızda tek tıkla açılabilir!

---

## ⚙️ Çevre Değişkenleri (Environment Variables)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `8686` | Web sunucu portu |
| `NODE_ENV` | `production` | Node.js çalışma ortamı |
| `DATA_DIR` | `/app/data` | SQLite veritabanı klasörü |
| `JWT_SECRET` | `cuzdanim-secret-key-2026` | Token imzalama anahtarı (kendinize özel belirleyin) |

---

## 🚀 Yerel Geliştirme (Windows/Mac/Linux)

```bash
npm install
npm start
```
Varsayılan olarak `http://localhost:8686` üzerinde çalışır.
