// ============================================================================
// ORDU YÖNETİMİ (TSF) — KOMUTA & KONTROL BOTU + WEB PANEL SUNUCUSU (ordu.js)
// Sürüm: 5.1.0 (RoWifi Tarzı Roblox OAuth 2.0 + Tekil Slash Komut Optimizasyonu)
// ============================================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

process.on('unhandledRejection', (err) => {
    console.error('⚠️ Ağ / Promise Uyarısı (Bot devam ediyor):', err?.message || err);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Sistem Uyarısı (Bot devam ediyor):', err?.message || err);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    ChannelType,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

// Ses & Şifreleme Modülleri
let VoiceLib = null;
let sodiumReadyPromise = null;
let opusEngineName = 'YOK';
let NativeOpusEncoder = null;
let OpusScriptClass = null;

try {
    VoiceLib = require('@discordjs/voice');
    try {
        const sodium = require('libsodium-wrappers');
        sodiumReadyPromise = sodium.ready;
    } catch (_) {}
    try {
        const opusMod = require('@discordjs/opus');
        NativeOpusEncoder = opusMod.OpusEncoder;
        opusEngineName = '@discordjs/opus';
    } catch (_) {}
    try {
        OpusScriptClass = require('opusscript');
        if (opusEngineName === 'YOK') opusEngineName = 'opusscript';
    } catch (_) {}
} catch (_) {
    console.warn('ℹ️ @discordjs/voice yüklü değil; ses özellikleri devre dışı.');
}

try {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        const { ProxyAgent, setGlobalDispatcher } = require('undici');
        setGlobalDispatcher(new ProxyAgent(proxyUrl));
    }
} catch (_) {}

// ============================================================================
// 1. YAPILANDIRMA, SÜPER YETKİLİ & RESMİ TSF RÜTBE HİYERARŞİSİ
// ============================================================================
const SUPER_ADMIN_ID = '1520781174656467154'; // Tüm rütbe ve sistem kısıtlamalarından muaf

const PORT = Number(process.env.PORT) || 3000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/discord/callback`).trim();
const BASE_URL = (
    process.env.BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.REDIRECT_URI ? process.env.REDIRECT_URI.replace(/\/auth\/discord\/callback.*$/, '') : `http://localhost:${PORT}`)
).trim().replace(/\/$/, '');
const ROBLOX_CLIENT_ID = (process.env.ROBLOX_CLIENT_ID || '').trim();
const ROBLOX_CLIENT_SECRET = (process.env.ROBLOX_CLIENT_SECRET || '').trim();
const ROBLOX_REDIRECT_URI = (process.env.ROBLOX_REDIRECT_URI || `${BASE_URL}/auth/roblox/callback`).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_API_KEYS = Array.from(new Set(
    `${process.env.GEMINI_API_KEY || ''},${process.env.GEMINI_API_KEYS || ''}`
        .split(/[,\s\n]+/)
        .map(k => k.trim())
        .filter(Boolean)
));
const DEFAULT_ROBLOX_GROUP_ID = (process.env.ROBLOX_GROUP_ID || '137412624').trim();
const ROBLOX_API_KEY = (process.env.ROBLOX_API_KEY || '').trim();
const ROBLOX_COOKIE = (process.env.ROBLOX_COOKIE || '').trim();
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || '').trim().replace(/\/$/, '');

const DB_PATH = path.join(__dirname, 'veritabani.json');
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');
const KAYITLAR_DIR = path.join(__dirname, 'kayitlar');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const KUFURLER_PATH = path.join(__dirname, 'kufurler.txt');
const KELIMELER_PATH = path.join(__dirname, 'kelimeler.txt');

for (const dir of [KAYITLAR_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const VARSAYILAN_TSF_RUTBELER = [
    // Er & Astsubay Sınıfı
    { ad: '[Or-1] Acemi Er', sinif: 'Er & Astsubay' },
    { ad: '[Or-2] Onbaşı', sinif: 'Er & Astsubay' },
    { ad: '[Or-3] Uzman Onbaşı', sinif: 'Er & Astsubay' },
    { ad: '[Or-4] Çavuş', sinif: 'Er & Astsubay' },
    { ad: '[Or-5] Uzman Çavuş', sinif: 'Er & Astsubay' },
    { ad: '[Or-6] Astsubay Çavuş', sinif: 'Er & Astsubay' },
    { ad: '[Or-7] Astsubay Kıdemli Çavuş', sinif: 'Er & Astsubay' },
    { ad: '[Or-8] Astsubay Üstçavuş', sinif: 'Er & Astsubay' },
    { ad: '[Or-9] Astsubay Kıdemli Üstçavuş', sinif: 'Er & Astsubay' },
    // Subay & General Sınıfı
    { ad: '[OF-1/A] Asteğmen', sinif: 'Subay & General' },
    { ad: '[OF-1/B] Teğmen', sinif: 'Subay & General' },
    { ad: '[OF-1/C] Üsteğmen', sinif: 'Subay & General' },
    { ad: '[OF-2] Yüzbaşı', sinif: 'Subay & General' },
    { ad: '[OF-3] Binbaşı', sinif: 'Subay & General' },
    { ad: '[OF-4] Yarbay', sinif: 'Subay & General' },
    { ad: '[OF-5] Albay', sinif: 'Subay & General' },
    { ad: '[OF-6] Tuğgeneral', sinif: 'Subay & General' },
    { ad: '[OF-7] Tümgeneral', sinif: 'Subay & General' },
    { ad: '[OF-8] Korgeneral', sinif: 'Subay & General' },
    { ad: '[OF-9] Orgeneral', sinif: 'Subay & General' },
    // Üst Komuta & Yönetim Kademesi
    { ad: 'Büyük Konsey', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Ankara Heyeti', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Yüksek Askeri Şura', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Disiplin Kurulu', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Genel Kurmay', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Genel Kurmay Başkanı', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Lider', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Yönetim Kurulu', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Yönetim Kurulu Başkanı', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Başkomutan', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Baş Geliştirici', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Yardımcı Grup Sahibi', sinif: 'Üst Komuta & Yönetim' },
    { ad: '[OF-10] Mareşal', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Grup Sahibi', sinif: 'Üst Komuta & Yönetim' }
];

const VARSAYILAN_SINAV_SORULARI = [
    {
        soru: '1) Bir üst rütbeli komutan odaya veya alana girdiğinde ilk olarak ne yapılmalıdır?',
        secenekler: ['Hiçbir şey yapılmaz', 'Dikkat / Selam durulup tekmil verilir', 'Oyun sohbetine devam edilir', 'Kanal değiştirilir'],
        dogru: 1
    },
    {
        soru: '2) TSF hiyerarşisinde [Or-1] Acemi Er rütbesinden sonraki ilk terfi rütbesi hangisidir?',
        secenekler: ['[Or-2] Onbaşı', '[Or-4] Çavuş', '[OF-1/A] Asteğmen', '[Or-6] Astsubay Çavuş'],
        dogru: 0
    },
    {
        soru: '3) Operasyon veya eğitim esnasında telsiz/ses disiplini nasıl olmalıdır?',
        secenekler: ['Herkes aynı anda konuşabilir', 'Sadece komutan söz verdiğinde kısa ve net konuşulur', 'Müzik açılabilir', 'Sohbet serbesttir'],
        dogru: 1
    },
    {
        soru: '4) Emir-komuta zincirinde bir sorun veya şikayet yaşandığında ne yapılmalıdır?',
        secenekler: ['Genel sohbette tartışma çıkarılır', 'Destek bileti (Ticket) veya üst komuta üzerinden resmi bildirim yapılır', 'Sunucudan çıkılır', 'Diğer askerlere hakaret edilir'],
        dogru: 1
    },
    {
        soru: '5) Mazeretli olarak birkaç gün aktif olamayacak personel hangi sistemi kullanmalıdır?',
        secenekler: ['Haber vermeden kaybolur', '/izin talep (LOA) sistemi ile resmi mazeret bildirir', 'Rütbe ister', 'Sadece oyun içi yazar'],
        dogru: 1
    }
];

const VARSAYILAN_UYARI_KURALLARI = [
    { esik: 1, aksiyon: 'uyar', sureDk: 0 },
    { esik: 2, aksiyon: 'timeout', sureDk: 10 },
    { esik: 3, aksiyon: 'timeout', sureDk: 60 },
    { esik: 4, aksiyon: 'kick', sureDk: 0 },
    { esik: 5, aksiyon: 'ban', sureDk: 0 }
];

// ============================================================================
// 2. TÜRKÇE NORMALİZASYON & GELİŞMİŞ KÜFÜR/ARGO FİLTRESİ
// ============================================================================
function turkceNormalize(metin) {
    return String(metin || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/@/g, 'a').replace(/\$/g, 's');
}

const TEMEL_KUFURLER = [
    'aq', 'amk', 'mk', 'amq', 'oc', 'oç', 'sg', 'pic', 'piç', 'siktir', 'sktir',
    'sikim', 'sikeyim', 'sikerim', 'sikik', 'yarrak', 'yarak', 'orospu', 'orspu',
    'kahpe', 'amcik', 'amcık', 'göt', 'gotveren', 'pezevenk', 'yavsak', 'yavşak',
    'ibne', 'puşt', 'pust', 'serefsiz', 'şerefsiz', 'ananı', 'anani', 'bacını',
    'bacini', 'malmısın', 'gerizekalı', 'gerizekali', 'aptal', 'salak', 'dingil',
    'bok', 'hassiktir', 'hasktr', 'sıçayım', 'sicayim', 'amına', 'amina'
];

const yasakliSet = new Set(TEMEL_KUFURLER);
const sozlukSet = new Set();

if (fs.existsSync(KUFURLER_PATH)) {
    for (const s of fs.readFileSync(KUFURLER_PATH, 'utf8').split(/\r?\n/)) {
        const temiz = s.trim().toLocaleLowerCase('tr-TR');
        if (temiz.length >= 2) yasakliSet.add(temiz);
    }
}
if (fs.existsSync(KELIMELER_PATH)) {
    for (const s of fs.readFileSync(KELIMELER_PATH, 'utf8').split(/\r?\n/)) {
        const temiz = s.trim().toLocaleLowerCase('tr-TR');
        if (temiz.length >= 2) sozlukSet.add(temiz);
    }
}

function kufurKontrolEt(mesajIcerik, ekstraYasaklilar = []) {
    const hamKelimeler = String(mesajIcerik || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);

    const ekstraSet = new Set((ekstraYasaklilar || []).map(k => k.trim().toLocaleLowerCase('tr-TR')).filter(Boolean));

    for (const kelime of hamKelimeler) {
        if (ekstraSet.has(kelime)) return kelime;
        if (yasakliSet.has(kelime)) return kelime;

        const norm = turkceNormalize(kelime).replace(/(.)\1{1,}/g, '$1');
        if (yasakliSet.has(norm) && !sozlukSet.has(kelime)) return norm;

        if (!sozlukSet.has(kelime) && norm.length >= 3) {
            for (const yasak of ekstraSet) {
                if (norm === turkceNormalize(yasak)) return yasak;
            }
            for (const yasak of yasakliSet) {
                const normYasak = turkceNormalize(yasak);
                if (normYasak.length >= 4 && norm === normYasak) return yasak;
            }
        }
    }
    return null;
}

// ============================================================================
// 3. KALICI VERİTABANI (YEREL + FIREBASE BULUT SENKRONİZASYONU)
// ============================================================================
function dbYukle() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const p = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            return {
                sunucular: p.sunucular || {},
                sesKayitlari: p.sesKayitlari || [],
                verifiedUsers: p.verifiedUsers || {},
                pendingVerifications: p.pendingVerifications || {}
            };
        }
    } catch (e) {
        console.error('Veritabanı okuma hatası:', e.message);
    }
    return { sunucular: {}, sesKayitlari: [], verifiedUsers: {}, pendingVerifications: {} };
}

function verifyKaydiBulDiscordIle(discordId, ayar = null) {
    if (!db.verifiedUsers) db.verifiedUsers = {};
    return db.verifiedUsers[discordId] || ayar?.dogrulamalar?.[discordId] || null;
}

function verifyKaydiBulRobloxIle(robloxId, robloxUsername, ayar = null) {
    const rIdStr = String(robloxId || '').trim();
    const rNameLow = String(robloxUsername || '').trim().toLowerCase();
    for (const kaynak of [db.verifiedUsers || {}, ayar?.dogrulamalar || {}]) {
        for (const [dId, kayit] of Object.entries(kaynak)) {
            if (!kayit) continue;
            if (rIdStr && String(kayit.robloxId) === rIdStr) return { discordId: dId, ...kayit };
            if (rNameLow && String(kayit.robloxUsername || '').toLowerCase() === rNameLow) return { discordId: dId, ...kayit };
        }
    }
    return null;
}

function verifyKaydet(discordId, robloxId, robloxUsername, yontem = 'Kod', guildId = null) {
    if (!db.verifiedUsers) db.verifiedUsers = {};
    const kayit = {
        robloxId: String(robloxId),
        robloxUsername: String(robloxUsername),
        yontem,
        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
    };
    db.verifiedUsers[discordId] = kayit;
    if (guildId) {
        const ayar = sunucuAyarGetir(guildId);
        ayar.dogrulamalar[discordId] = kayit;
    }
    for (const s of Object.values(db.sunucular || {})) {
        if (s && s.dogrulamalar) s.dogrulamalar[discordId] = kayit;
    }
    dbKaydet(true);
    return kayit;
}

let db = dbYukle();
let dbSaveTimer = null;

async function bulutDbYukle() {
    if (!FIREBASE_DB_URL) return;
    try {
        const res = await fetch(`${FIREBASE_DB_URL}/ordu_db.json`);
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object' && data.sunucular) {
                db = { sunucular: data.sunucular || {}, sesKayitlari: data.sesKayitlari || [], verifiedUsers: data.verifiedUsers || {}, pendingVerifications: data.pendingVerifications || {} };
                fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
                console.log('☁️ Firebase bulut veritabanı senkronize edildi.');
            }
        }
    } catch (e) {
        console.warn('⚠️ Bulut DB okuma uyarısı:', e.message);
    }
}

function dbKaydet(hemen = false) {
    const yaz = () => {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        } catch (e) {
            console.error('Veritabanı yazma hatası:', e.message);
        }
        if (FIREBASE_DB_URL) {
            fetch(`${FIREBASE_DB_URL}/ordu_db.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(db)
            }).catch(() => {});
        }
    };
    if (hemen) {
        if (dbSaveTimer) clearTimeout(dbSaveTimer);
        yaz();
        return;
    }
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(yaz, 350);
}

function sunucuAyarGetir(guildId) {
    if (!db.sunucular[guildId]) db.sunucular[guildId] = {};
    const s = db.sunucular[guildId];

    const varsayilan = {
        prefix: '!',
        tema: {
            palet: 'navy',
            primary: '#3b82f6',
            accent: '#10b981',
            baslik: 'ORDU YÖNETİMİ',
            altBaslik: 'KOMUTA & KONTROL PANELİ'
        },
        moduller: {
            ai: true,
            aiModerasyon: true,
            ticket: true,
            rutbe: true,
            sesOdasi: true,
            sesDinleme: true,
            automod: true,
            seviye: true,
            karsilama: true,
            nobet: true,
            loa: true,
            operasyon: true,
            cekilis: true,
            ozelKomutlar: true,
            sinav: true,
            karaListe: true
        },
        robloxGrupId: DEFAULT_ROBLOX_GROUP_ID,
        rutbeYetkiliRol: '',
        tsfRutbeler: JSON.parse(JSON.stringify(VARSAYILAN_TSF_RUTBELER)),
        dogrulamalar: {}, // discordId -> { robloxId, robloxUsername, tarih, yontem }
        bekleyenDogrulamalar: {}, // discordId -> { robloxId, robloxUsername, kod, zaman }
        sicilKayitlari: {}, // discordId -> { madalyalar: [], disiplin: [] }
        karaListe: [], // { id, discordId, robloxId, robloxUsername, sebep, yetkili, tarih }
        karaListeOtoBan: false,
        sinavAyar: {
            gecmeYuzdesi: 80,
            terfiHedefRutbe: '[Or-2] Onbaşı',
            sorular: JSON.parse(JSON.stringify(VARSAYILAN_SINAV_SORULARI))
        },
        aiAktif: true,
        aiIzinliKanallar: [],
        aiBaglamMesajSayisi: 10,
        aiSistemTalimati: 'Sen ORDU YÖNETİMİ (TSF) sunucusunun disiplinli, saygılı, akıllı ve Türkçeye tam hakim Komuta Yapay Zeka Asistanısın. Rütbeleri ve rolleri kesin doğrulukla oku, sorulan soruları eksiksiz ve net yanıtla.',
        ticketKategori: '',
        ticketYetkiliRol: '',
        ticketAiAktif: true,
        ticketPanelBaslik: '🎫 ORDU YÖNETİMİ — Destek & Yardım Merkezi',
        ticketPanelAciklama: 'Aşağıdaki açılır menüden talebinize uygun alt başlığı seçerek destek bileti oluşturabilirsiniz. Talebinize ekran görüntüsü (.png/.jpg) ekleyebilirsiniz.',
        ticketMenuPlaceholder: '📂 Destek Kategorisi / Alt Başlık Seçin...',
        ticketPanelFooter: 'ORDU YÖNETİMİ • 7/24 Komuta Destek Hattı',
        ticketAcilisBaslik: '{emoji} {kategori} — Destek Talebi',
        ticketAcilisMesaj: 'Merhaba {uye}, destek talebiniz başarıyla oluşturuldu.\n\n• **Seçilen Alt Başlık:** {kategori}\n• **Açıklama:** {aciklama}\n\nYetkili komutanlarımız en kısa sürede ilgilenecektir.',
        ticketPanelGorselUrl: '',
        ticketPanelRenk: '#3b82f6',
        ticketKonular: [
            { id: 'rutbe_talebi', isim: 'Rütbe & Terfi Talebi', aciklama: 'TSF Roblox rütbe ve /update işlemleri', emoji: '🎖️', gorselUrl: '', karsilamaNotu: 'Lütfen Roblox kullanıcı adınızı ve mevcut rütbenizi yazın.' },
            { id: 'sikayet_bildirim', isim: 'Disiplin & Şikayet Bildirimi', aciklama: 'Kural ihlali veya personel şikayetleri', emoji: '⚖️', gorselUrl: '', karsilamaNotu: 'Lütfen şikayet ettiğiniz kişinin adını ve varsa kanıt görselini ekleyin.' },
            { id: 'genel_destek', isim: 'Genel Komuta Desteği', aciklama: 'Sunucu ve operasyon hakkında sorularınız', emoji: '🎫', gorselUrl: '', karsilamaNotu: 'Sorunuzu detaylıca yazabilirsiniz.' }
        ],
        sesPanelBaslik: '🎙️ Özel Ses Odası Oluşturma Merkezi',
        sesPanelAciklama: 'Aşağıdaki butonlara tıklayarak kendinize veya timinize özel ses odası açabilirsiniz. Oda boşaldığında otomatik silinir.',
        sesPanelRenk: '#3b82f6',
        acikBiletler: {},
        kapatilanBiletler: [],
        ozelSesKategori: '',
        sesArsivKanal: '', // WAV dosyalarının kalıcı yedekleneceği Discord metin kanalı
        ozelSesOdalari: {},
        automod: {
            kufurEngel: true,
            aiModerasyonAktif: true,
            linkEngel: false,
            capsEngel: false,
            spamEngel: true,
            tekrarMesajEngel: true,
            yeniHesapKorumaGun: 0,
            muafRol: '',
            yasakliKelimeler: [],
            cezaAksiyonu: 'uyari_merdiveni', // sil | sil_uyar | sil_timeout | uyari_merdiveni
            timeoutDakika: 5,
            uyariKurallari: JSON.parse(JSON.stringify(VARSAYILAN_UYARI_KURALLARI))
        },
        ozelKomutlar: [
            { id: 'ornek_grup', tetikleyici: 'grup', cevapMetni: 'TSF Resmi Roblox Grubumuza buradan katılabilirsiniz:', url: 'https://www.roblox.com/groups/137412624', gorselUrl: '', embedOlsun: true, renk: '#3b82f6', butonMetni: '🎖️ Roblox Grubuna Git' }
        ],
        cekilisler: [], // { id, kanalId, mesajId, odul, kazananSayisi, bitisTimestamp, olusturan, bitti, katilanlar: [], kazananlar: [], sartRolId, sartMinSeviye, sartMinNobetDk }
        sesLogKanal: '',
        rolLogKanal: '',
        mesajLogKanal: '',
        modLogKanal: '',
        girisCikisLogKanal: '',
        otoRol: '',
        girisArkaPlanUrl: 'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?auto=format&fit=crop&w=1200&q=80',
        cikisArkaPlanUrl: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80',
        girisBaslik: '📥 Yeni Personel Katıldı!',
        girisMesaj: 'Hoş geldin {uye}! Sunucumuz seninle birlikte **{sayi}** kişiye ulaştı.',
        girisRenk: '#10b981',
        cikisBaslik: '📤 Personel Ayrıldı',
        cikisMesaj: '**{tag}** sunucudan ayrıldı. Kalan üye sayısı: **{sayi}**',
        cikisRenk: '#ef4444',
        leveling: {
            aktif: true,
            seviyeKanal: '',
            xpCarpan: 1,
            kullanicilar: {}
        },
        nobetSureleri: {},
        izinliRolId: '',
        loaTalepleri: [],
        operasyonlar: [],
        uyarilar: [],
        logs: []
    };

    db.sunucular[guildId] = {
        ...varsayilan,
        ...s,
        tema: { ...varsayilan.tema, ...(s.tema || {}) },
        moduller: { ...varsayilan.moduller, ...(s.moduller || {}) },
        automod: { ...varsayilan.automod, ...(s.automod || {}) },
        leveling: { ...varsayilan.leveling, ...(s.leveling || {}) },
        sinavAyar: { ...varsayilan.sinavAyar, ...(s.sinavAyar || {}) }
    };
    if (!Array.isArray(db.sunucular[guildId].tsfRutbeler) || db.sunucular[guildId].tsfRutbeler.length === 0) {
        db.sunucular[guildId].tsfRutbeler = JSON.parse(JSON.stringify(VARSAYILAN_TSF_RUTBELER));
    }
    if (!Array.isArray(db.sunucular[guildId].automod.uyariKurallari) || db.sunucular[guildId].automod.uyariKurallari.length === 0) {
        db.sunucular[guildId].automod.uyariKurallari = JSON.parse(JSON.stringify(VARSAYILAN_UYARI_KURALLARI));
    }
    return db.sunucular[guildId];
}

function logEkle(guildId, kategori, islem, detay, kullanici = 'Sistem') {
    const ayar = sunucuAyarGetir(guildId);
    const tarih = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    ayar.logs.unshift({
        id: crypto.randomUUID(),
        tarih,
        kategori,
        islem,
        detay,
        kullanici
    });
    if (ayar.logs.length > 400) ayar.logs.length = 400;
    dbKaydet();
}

let sessions = new Map();
try {
    if (fs.existsSync(SESSIONS_PATH)) {
        sessions = new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'))));
    }
} catch (_) {}

function sessionKaydet() {
    try {
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8');
    } catch (_) {}
}

// ============================================================================
// 4. GÜVENLİ HTTP YARDIMCISI & GÖRSEL EK HAZIRLAYICI (.PNG / URL)
// ============================================================================
async function guvenliFetch(url, options = {}, deneme = 3) {
    let sonHata = null;
    for (let i = 1; i <= deneme; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return res;
        } catch (err) {
            sonHata = err;
            if (i < deneme) await new Promise(r => setTimeout(r, 600 * i));
        }
    }
    throw sonHata || new Error('Ağ bağlantısı başarısız.');
}

// URL veya yerel yüklenmiş /uploads/...png dosyasını Embed'e ekler
function gorselEmbedVeEkHazirla(embed, gorselDeger) {
    const files = [];
    const val = String(gorselDeger || '').trim();
    if (!val) return files;

    if (val.startsWith('http://') || val.startsWith('https://')) {
        embed.setImage(val);
    } else if (val.startsWith('/uploads/')) {
        const dosyaAdi = path.basename(val);
        const tamYol = path.join(UPLOADS_DIR, dosyaAdi);
        if (fs.existsSync(tamYol)) {
            files.push(new AttachmentBuilder(tamYol, { name: dosyaAdi }));
            embed.setImage(`attachment://${dosyaAdi}`);
        }
    } else if (val.startsWith('data:image/')) {
        const match = val.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
        if (match) {
            const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
            const buf = Buffer.from(match[2], 'base64');
            const ad = `gorsel_${Date.now()}.${ext}`;
            files.push(new AttachmentBuilder(buf, { name: ad }));
            embed.setImage(`attachment://${ad}`);
        }
    }
    return files;
}

// ============================================================================
// 5. ROBLOX TSF RÜTBE, OAUTH 2.0 DOĞRULAMA & HİYERARŞİ KORUMA MOTORU
// ============================================================================
const robloxRolCache = new Map();
const pendingRobloxOAuth = new Map(); // state -> { userId, guildId, createdAt }

function robloxOAuthLinkOlustur(userId, guildId) {
    const state = crypto.randomBytes(24).toString('hex');
    pendingRobloxOAuth.set(state, { userId: String(userId), guildId: String(guildId), createdAt: Date.now() });
    setTimeout(() => pendingRobloxOAuth.delete(state), 10 * 60 * 1000);
    return `${BASE_URL}/auth/roblox?state=${state}`;
}

async function robloxGrupRolleriniGetir(groupId, zorlaYenile = false) {
    const gId = String(groupId || DEFAULT_ROBLOX_GROUP_ID).trim();
    const cached = robloxRolCache.get(gId);
    if (!zorlaYenile && cached && Date.now() - cached.zaman < 60_000) {
        return cached.roller;
    }

    let roller = [];
    if (ROBLOX_API_KEY) {
        try {
            const res = await guvenliFetch(`https://apis.roblox.com/cloud/v2/groups/${gId}/roles?maxPageSize=100`, {
                headers: { 'x-api-key': ROBLOX_API_KEY }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.groupRoles)) {
                    roller = data.groupRoles.map(r => ({
                        id: String(r.id),
                        path: r.path || `groups/${gId}/roles/${r.id}`,
                        name: r.displayName || r.name || `Rank ${r.rank}`,
                        rank: Number(r.rank || 0)
                    }));
                }
            }
        } catch (_) {}
    }

    if (roller.length === 0) {
        const res = await guvenliFetch(`https://groups.roblox.com/v1/groups/${gId}/roles`);
        if (!res.ok) throw new Error(`Roblox grup rolleri alınamadı (HTTP ${res.status}).`);
        const data = await res.json();
        roller = (data.roles || []).map(r => ({
            id: String(r.id),
            path: `groups/${gId}/roles/${r.id}`,
            name: r.name,
            rank: Number(r.rank || 0)
        }));
    }

    const gorulenIsimler = new Set();
    const temizRoller = [];
    for (const r of roller.sort((a, b) => a.rank - b.rank)) {
        let ad = r.name
            .replace(/^OF-6\s+Tuğgeneral/i, '[OF-6] Tuğgeneral')
            .replace(/\[OF-7\]\s*Tumgeneral/i, '[OF-7] Tümgeneral')
            .replace(/^OF-10\s+Mareşal/i, '[OF-10] Mareşal')
            .trim();
        const anahtar = turkceNormalize(ad);
        if (gorulenIsimler.has(anahtar)) continue;
        gorulenIsimler.add(anahtar);
        temizRoller.push({ ...r, name: ad });
    }

    robloxRolCache.set(gId, { zaman: Date.now(), roller: temizRoller });
    return temizRoller;
}

async function robloxKullaniciBul(kullaniciAdi) {
    const temizAd = String(kullaniciAdi || '').trim();
    if (!temizAd) throw new Error('Roblox kullanıcı adı boş olamaz.');
    const res = await guvenliFetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [temizAd], excludeBannedUsers: false })
    });
    if (!res.ok) throw new Error(`Roblox kullanıcı servisi hatası (HTTP ${res.status}).`);
    const data = await res.json();
    const u = data?.data?.[0];
    if (!u || !u.id) throw new Error(`"${temizAd}" adında Roblox kullanıcısı bulunamadı.`);

    let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${u.id}&width=150&height=150&format=png`;
    try {
        const thumbRes = await guvenliFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${u.id}&size=150x150&format=Png&isCircular=false`);
        if (thumbRes.ok) {
            const tData = await thumbRes.json();
            if (tData?.data?.[0]?.imageUrl) avatarUrl = tData.data[0].imageUrl;
        }
    } catch (_) {}

    return { id: String(u.id), username: u.name, displayName: u.displayName || u.name, avatarUrl };
}

async function robloxKullaniciDetayGetir(userId) {
    const res = await guvenliFetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!res.ok) throw new Error('Roblox profil bilgisi alınamadı.');
    return res.json();
}

async function robloxKullaniciGrupBilgisi(groupId, userId) {
    const res = await guvenliFetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    if (!res.ok) return null;
    const data = await res.json();
    const kayit = (data.data || []).find(g => String(g.group?.id) === String(groupId));
    if (!kayit) return null;
    return { roleId: String(kayit.role.id), roleName: kayit.role.name, rank: Number(kayit.role.rank) };
}

async function robloxCsrfTokenAl() {
    if (!ROBLOX_COOKIE) throw new Error('ROBLOX_COOKIE tanımlı değil.');
    const res = await guvenliFetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`, 'Content-Type': 'application/json' }
    });
    const token = res.headers.get('x-csrf-token');
    if (!token) throw new Error('Roblox CSRF token alınamadı.');
    return token;
}

async function robloxGrupRutbeDegistir(groupId, userId, hedefRol) {
    const gId = String(groupId).trim();
    const uId = String(userId).trim();
    let openCloudHata = null;

    if (ROBLOX_API_KEY) {
        try {
            const filterExpr = encodeURIComponent(`user=='users/${uId}'`);
            const listRes = await guvenliFetch(`https://apis.roblox.com/cloud/v2/groups/${gId}/memberships?maxPageSize=10&filter=${filterExpr}`, {
                headers: { 'x-api-key': ROBLOX_API_KEY }
            });
            if (!listRes.ok) throw new Error(`Open Cloud üyelik hatası (HTTP ${listRes.status})`);
            const listData = await listRes.json();
            const uyelik = listData?.groupMemberships?.[0];
            if (!uyelik?.path) throw new Error('Kullanıcı bu Roblox grubuna üye değil!');

            const patchRes = await guvenliFetch(`https://apis.roblox.com/cloud/v2/${uyelik.path}`, {
                method: 'PATCH',
                headers: { 'x-api-key': ROBLOX_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: hedefRol.path || `groups/${gId}/roles/${hedefRol.id}` })
            });
            if (!patchRes.ok) {
                const errJson = await patchRes.json().catch(() => ({}));
                throw new Error(errJson.message || `HTTP ${patchRes.status}`);
            }
            return { basarili: true, yontem: 'Open Cloud v2' };
        } catch (err) {
            openCloudHata = err.message;
        }
    }

    if (ROBLOX_COOKIE) {
        const csrf = await robloxCsrfTokenAl();
        const patchRes = await guvenliFetch(`https://groups.roblox.com/v1/groups/${gId}/users/${uId}`, {
            method: 'PATCH',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                'x-csrf-token': csrf,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ roleId: Number(hedefRol.id) })
        });
        if (!patchRes.ok) {
            const errJson = await patchRes.json().catch(() => ({}));
            throw new Error(errJson?.errors?.[0]?.message || `HTTP ${patchRes.status}`);
        }
        return { basarili: true, yontem: 'Cookie Auth' };
    }

    throw new Error(openCloudHata || 'ROBLOX_API_KEY veya ROBLOX_COOKIE yapılandırılmamış.');
}

// Başkomutan / Başkumandan eş anlamlı rütbe eşleştirme
function rutbeAdEslesirMi(rolAdi, hedefRutbeAdi) {
    const temiz = s => turkceNormalize(s).replace(/baskumandan/g, 'baskomutan').replace(/[^a-z0-9]/g, '');
    const rT = temiz(rolAdi);
    const hT = temiz(hedefRutbeAdi);
    if (!rT || !hT) return false;
    if (rT === hT) return true;
    const hParantezsiz = temiz(hedefRutbeAdi.replace(/^\[[^\]]+\]\s*/, ''));
    if (hParantezsiz.length >= 3 && (rT === hParantezsiz || rT.includes(hParantezsiz))) return true;
    const kodEs = hedefRutbeAdi.match(/\b(OF|OR|WO|CW)[\s\-_]?(\d{1,2}(?:\/[ABC])?)\b/i);
    if (kodEs) {
        const kodT = temiz(kodEs[1] + kodEs[2]);
        if (rT.includes(kodT)) return true;
    }
    return false;
}

function rutbeIndexBul(rutbeAdi, ayar) {
    const hiyerarsi = ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;
    for (let i = hiyerarsi.length - 1; i >= 0; i--) {
        if (rutbeAdEslesirMi(rutbeAdi, hiyerarsi[i].ad)) return i;
    }
    return -1;
}

// Üyenin EN YÜKSEK TSF Rütbesini, tüm Discord rollerini, madalyalarını ve sicilini tam doğrulukla analiz eder
function uyeRutbeVeKimlikAnaliz(guild, member, ayar) {
    if (!member) return null;
    const siraliRoller = member.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    const roller = siraliRoller.map(r => r.name);
    const hiyerarsi = ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;

    let enYuksekRutbe = null;
    let enYuksekIndex = -1;

    for (let i = 0; i < hiyerarsi.length; i++) {
        const eslesti = roller.some(rol => rutbeAdEslesirMi(rol, hiyerarsi[i].ad));
        if (eslesti && i > enYuksekIndex) {
            enYuksekIndex = i;
            enYuksekRutbe = hiyerarsi[i];
        }
    }

    const enYuksekDiscordRol = siraliRoller.first()?.name || 'Rütbesiz / Sivil';
    const xp = ayar.leveling?.kullanicilar?.[member.id] || { seviye: 1, xp: 0 };
    const uyariSayisi = (ayar.uyarilar || []).filter(u => u.kullaniciId === member.id).length;
    const nobetSn = ayar.nobetSureleri?.[member.id]?.toplamSaniye || 0;
    const dogrulama = verifyKaydiBulDiscordIle(member.id, ayar);
    const sicil = ayar.sicilKayitlari?.[member.id] || { madalyalar: [], disiplin: [] };

    return {
        id: member.id,
        tag: member.user.tag,
        displayName: member.displayName,
        enYuksekRutbe: enYuksekRutbe ? `${enYuksekRutbe.ad} (${enYuksekRutbe.sinif})` : enYuksekDiscordRol,
        enYuksekRutbeSaf: enYuksekRutbe ? enYuksekRutbe.ad : enYuksekDiscordRol,
        enYuksekDiscordRol,
        rutbeIndex: enYuksekIndex,
        roller,
        seviye: xp.seviye,
        xp: xp.xp,
        uyariSayisi,
        nobetDakika: Math.round(nobetSn / 60),
        robloxUsername: dogrulama?.robloxUsername || null,
        robloxId: dogrulama?.robloxId || null,
        madalyalar: sicil.madalyalar || [],
        disiplin: sicil.disiplin || []
    };
}

// Kendi rütbesinden yüksek veya eşit rütbe verme engelleyici (1520781174656467154 MUAF)
function hiyerarsiYetkiKontrol(guild, yetkiliMember, yetkiliUserId, hedefRutbeAdi, mevcutHedefRutbeAdi, ayar) {
    if (String(yetkiliUserId) === SUPER_ADMIN_ID || yetkiliUserId === 'local_admin') {
        return { izinli: true };
    }
    if (!yetkiliMember) {
        return { izinli: false, sebep: 'Yetkili sunucu üyesi doğrulanamadı.' };
    }
    if (guild.ownerId === yetkiliMember.id) {
        return { izinli: true };
    }

    const yetkiliAnaliz = uyeRutbeVeKimlikAnaliz(guild, yetkiliMember, ayar);
    const yetkiliIdx = yetkiliAnaliz?.rutbeIndex ?? -1;
    const hedefIdx = rutbeIndexBul(hedefRutbeAdi, ayar);
    const mevcutHedefIdx = mevcutHedefRutbeAdi ? rutbeIndexBul(mevcutHedefRutbeAdi, ayar) : -1;

    if (yetkiliIdx === -1) {
        return { izinli: false, sebep: 'Sunucuda tanımlı bir TSF rütbeniz olmadığı için rütbe ataması yapamazsınız.' };
    }
    if (hedefIdx !== -1 && hedefIdx >= yetkiliIdx) {
        return {
            izinli: false,
            sebep: `Kendi rütbeniz (${yetkiliAnaliz.enYuksekRutbeSaf}) ile eşit veya daha yüksek bir rütbe (${hedefRutbeAdi}) veremezsiniz!`
        };
    }
    if (mevcutHedefIdx !== -1 && mevcutHedefIdx >= yetkiliIdx) {
        return {
            izinli: false,
            sebep: `Kendinizle eşit veya üst rütbedeki (${mevcutHedefRutbeAdi}) bir personelin rütbesini değiştiremezsiniz!`
        };
    }
    return { izinli: true };
}

async function discordRutbeRoluBulVeEslestir(guild, robloxRutbeAdi) {
    const sunucuRolleri = Array.from(guild.roles.cache.values()).filter(r => !r.managed && r.id !== guild.id);
    return sunucuRolleri.find(r => rutbeAdEslesirMi(r.name, robloxRutbeAdi)) || null;
}

// /update KOMUTU MOTORU: Roblox rütbesini okur -> Eklenen & Çıkarılan rolleri uygular
async function kullaniciRolleriniGuncelle(guild, member, ayar, opsiyonelRobloxAdi = null) {
    const botUye = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botUye?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        throw new Error('Botun sunucuda **"Rolleri Yönet" (Manage Roles)** yetkisi yok! Sunucu Ayarları > Roller sekmesinden botun rolüne bu yetkiyi verin.');
    }

    const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;
    const dogrulama = verifyKaydiBulDiscordIle(member.id, ayar);
    if (!dogrulama && !opsiyonelRobloxAdi) {
        throw new Error('Henüz Roblox hesabınızı doğrulamadınız! Önce **`/verify oauth2`** veya **`/verify kod-al`** komutuyla hesabınızı bağlayın.');
    }

    const rUser = (dogrulama?.robloxId && !opsiyonelRobloxAdi)
        ? { id: dogrulama.robloxId, username: dogrulama.robloxUsername, avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${dogrulama.robloxId}&width=150&height=150&format=png` }
        : await robloxKullaniciBul(opsiyonelRobloxAdi);

    const karaKayit = (ayar.karaListe || []).find(k => k.discordId === member.id || (k.robloxId && k.robloxId === rUser.id));
    if (karaKayit) {
        throw new Error(`⛔ **KARA LİSTE UYARISI:** Bu hesap kara listededir! Sebep: ${karaKayit.sebep}`);
    }

    const [grupBilgi, tumRobloxRolleri] = await Promise.all([
        robloxKullaniciGrupBilgisi(groupId, rUser.id),
        robloxGrupRolleriniGetir(groupId)
    ]);

    if (!grupBilgi) {
        throw new Error(`**${rUser.username}** adlı oyuncu TSF Roblox grubuna (${groupId}) üye değil!`);
    }

    const hedefDiscordRol = await discordRutbeRoluBulVeEslestir(guild, grupBilgi.roleName);
    if (hedefDiscordRol && !hedefDiscordRol.editable) {
        throw new Error(`Botun rolü, verilmesi gereken **@${hedefDiscordRol.name}** rolünün altında kalıyor! Sunucu Ayarları > Roller kısmından botun rolünü **@${hedefDiscordRol.name}** rolünün ÜSTÜNE sürükleyin.`);
    }

    const eklenenRoller = [];
    const cikarilanRoller = [];
    const tumRutbeAdlari = new Set([
        ...tumRobloxRolleri.map(r => r.name),
        ...(ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER).map(r => r.ad)
    ]);

    for (const rAd of tumRutbeAdlari) {
        const dRol = await discordRutbeRoluBulVeEslestir(guild, rAd);
        if (dRol && (!hedefDiscordRol || dRol.id !== hedefDiscordRol.id) && member.roles.cache.has(dRol.id)) {
            if (dRol.editable) {
                await member.roles.remove(dRol).catch(() => {});
                cikarilanRoller.push(dRol);
            }
        }
    }

    if (hedefDiscordRol && !member.roles.cache.has(hedefDiscordRol.id)) {
        try {
            await member.roles.add(hedefDiscordRol);
            eklenenRoller.push(hedefDiscordRol);
        } catch (err) {
            throw new Error(`**@${hedefDiscordRol.name}** rolü verilemedi (${err.message}). Botun rolünü sunucu ayarlarında en üste taşıyın.`);
        }
    }

    logEkle(
        guild.id,
        'RUTBE',
        '/update Senkronizasyonu',
        `${member.user.tag} (${rUser.username}) | Eklenen: ${eklenenRoller.map(r => r.name).join(', ') || 'Yok'} | Çıkarılan: ${cikarilanRoller.map(r => r.name).join(', ') || 'Yok'}`,
        member.user.tag
    );

    return { robloxUser: rUser, grupBilgi, eklenenRoller, cikarilanRoller, hedefDiscordRol };
}

// Rütbe Ver İşlemi: Sadece Roblox rütbesini günceller, Discord rollerini /update'e bırakır!
async function tamRutbeIslemiYap({ guild, robloxKullaniciAdi, hedefRolId, yetkiliMember, yetkiliUserId, yetkiliEtiket }) {
    const ayar = sunucuAyarGetir(guild.id);
    const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;
    const [robloxUser, tumRoller] = await Promise.all([
        robloxKullaniciBul(robloxKullaniciAdi),
        robloxGrupRolleriniGetir(groupId, true)
    ]);

    const normAranan = turkceNormalize(String(hedefRolId));
    const hedefRol = tumRoller.find(r => String(r.id) === String(hedefRolId))
        || tumRoller.find(r => rutbeAdEslesirMi(r.name, String(hedefRolId)))
        || tumRoller.find(r => turkceNormalize(r.name).includes(normAranan));

    if (!hedefRol) throw new Error(`"${hedefRolId}" rütbesi TSF Roblox grubunda bulunamadı.`);
    if (hedefRol.rank === 0 || hedefRol.rank === 255) throw new Error('Bu rütbe sistem tarafından atanamaz.');

    const mevcutBilgi = await robloxKullaniciGrupBilgisi(groupId, robloxUser.id);
    if (!mevcutBilgi) throw new Error(`${robloxUser.username} TSF Roblox grubuna üye değil.`);

    // HİYERARŞİ KONTROLÜ (1520781174656467154 HARİÇ)
    const kontrol = hiyerarsiYetkiKontrol(guild, yetkiliMember, yetkiliUserId, hedefRol.name, mevcutBilgi.roleName, ayar);
    if (!kontrol.izinli) throw new Error(`⛔ ${kontrol.sebep}`);

    const sonuc = await robloxGrupRutbeDegistir(groupId, robloxUser.id, hedefRol);

    logEkle(guild.id, 'RUTBE', 'Roblox Rütbe Ataması', `${robloxUser.username}: ${mevcutBilgi.roleName} → ${hedefRol.name} (Discord için /update bekleniyor)`, yetkiliEtiket);

    const bagliDiscord = verifyKaydiBulRobloxIle(robloxUser.id, robloxUser.username, ayar);
    return {
        robloxUser,
        eskiRolAdi: mevcutBilgi.roleName,
        yeniRol: hedefRol,
        yontem: sonuc.yontem,
        bagliDiscord
    };
}

// ============================================================================
// 6. GEMINI AI (AKILLI RÜTBE LİSTESİ, DOĞRU ROL OKUMA & AI MODERASYON)
// ============================================================================
const geminiKotaBekleme = new Map(); // "keyIndex:model" -> unblockTimestamp

async function geminiSor(sistemTalimati, kullaniciMesaji, extraParts = [], maxTokens = 4096, mod = 'chat') {
    if (!GEMINI_API_KEYS.length) return '⚠️ GEMINI_API_KEY ortam değişkeni tanımlı değil.';

    const modelListesi = mod === 'mod'
        ? ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash']
        : ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

    const parts = [{ text: kullaniciMesaji }, ...extraParts];
    const etkiliMaxTokens = mod === 'mod' ? 120 : Math.max(2048, Number(maxTokens) || 4096);
    const simdi = Date.now();
    let sonHataMesaji = '';
    let kotaDolduSayaci = 0;

    for (let kIdx = 0; kIdx < GEMINI_API_KEYS.length; kIdx++) {
        const apiKey = GEMINI_API_KEYS[kIdx];
        for (const modelAdi of modelListesi) {
            const kovaKey = `${kIdx}:${modelAdi}`;
            const kilitBitis = geminiKotaBekleme.get(kovaKey) || 0;
            if (kilitBitis > simdi) {
                kotaDolduSayaci++;
                continue;
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelAdi}:generateContent?key=${encodeURIComponent(apiKey)}`;

            const istekGonder = async (thinkingBudgetKullan) => {
                const generationConfig = {
                    temperature: mod === 'mod' ? 0.1 : 0.45,
                    maxOutputTokens: etkiliMaxTokens
                };
                if (thinkingBudgetKullan && modelAdi.startsWith('gemini-2.5')) {
                    generationConfig.thinkingConfig = { thinkingBudget: mod === 'mod' ? 0 : 256 };
                }
                const body = {
                    systemInstruction: { parts: [{ text: sistemTalimati || 'Yardımcı bir asistansın.' }] },
                    contents: [{ role: 'user', parts }],
                    generationConfig
                };
                return guvenliFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }, 2);
            };

            let res = await istekGonder(true);
            if (!res.ok && res.status === 400) {
                res = await istekGonder(false);
            }

            if (res.status === 429) {
                const errText = await res.text().catch(() => '');
                kotaDolduSayaci++;
                // Eğer limit: 0 veya günlük kota bittiyse 10 dk, anlık RPM ise 65 sn bu modeli atla
                const kaliciLimitSifir = /limit:\s*0|PerDay/i.test(errText);
                geminiKotaBekleme.set(kovaKey, Date.now() + (kaliciLimitSifir ? 10 * 60 * 1000 : 65 * 1000));
                sonHataMesaji = 'Google AI Studio API kotası (429) doldu.';
                continue;
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                sonHataMesaji = `Gemini API Hatası (${res.status}): ${errText.slice(0, 160)}`;
                continue;
            }

            const data = await res.json();
            const candidate = data?.candidates?.[0];
            if (!candidate) {
                const blockReason = data?.promptFeedback?.blockReason;
                if (blockReason) return `⚠️ Güvenlik filtresi nedeniyle yanıt engellendi (${blockReason}).`;
                sonHataMesaji = 'AI boş aday yanıtı döndürdü.';
                continue;
            }

            const metinParcalari = (candidate.content?.parts || [])
                .filter(p => typeof p.text === 'string' && !p.thought)
                .map(p => p.text);
            const tamMetin = metinParcalari.join('').trim();

            if (!tamMetin) {
                sonHataMesaji = `AI metin üretemedi (${candidate.finishReason || 'Bilinmiyor'}).`;
                continue;
            }
            return tamMetin;
        }
    }

    if (kotaDolduSayaci > 0) {
        throw new Error('Google AI Studio API kullanım kotası (429) tükendi. Yeni ücretsiz API anahtarı oluşturup Render → Environment → GEMINI_API_KEY alanına girin (birden fazla anahtarı virgülle ayırarak ekleyebilirsiniz).');
    }
    throw new Error(sonHataMesaji || 'Gemini AI servisine şu an ulaşılamıyor.');
}

// 2000 karakter sınırını aşan AI yanıtlarını bölmeden parça parça gönderir
async function uzunMesajGonder(message, metin) {
    const temiz = String(metin || '').trim();
    if (!temiz) return;
    if (temiz.length <= 1950) {
        return message.reply(temiz);
    }
    const satirlar = temiz.split('\n');
    const parcalar = [];
    let mevcut = '';
    for (const satir of satirlar) {
        if ((mevcut + '\n' + satir).length > 1900) {
            if (mevcut) parcalar.push(mevcut.trim());
            if (satir.length > 1900) {
                for (let i = 0; i < satir.length; i += 1900) {
                    parcalar.push(satir.slice(i, i + 1900));
                }
                mevcut = '';
            } else {
                mevcut = satir;
            }
        } else {
            mevcut = mevcut ? `${mevcut}\n${satir}` : satir;
        }
    }
    if (mevcut.trim()) parcalar.push(mevcut.trim());

    for (let i = 0; i < parcalar.length; i++) {
        if (i === 0) await message.reply(parcalar[i]);
        else await message.channel.send(parcalar[i]);
    }
}

// Unicode süslü fontları (örn: 𝗻𝗲𝘁𝗥𝗢𝗡_𝗽𝗮𝘀𝗮) normal ASCII metne çevirir
function gorunenAdNormalize(metin) {
    return String(metin || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .trim();
}

// Sunucunun tamamını (roller, üst komuta kadrosu, kanallar, üyeler, istatistikler) AI için özetler
async function sunucuTamBaglamOlustur(guild, ayar) {
    if (guild.members.cache.size < Math.min(guild.memberCount, 50)) {
        await guild.members.fetch().catch(() => {});
    }

    const sahip = await guild.fetchOwner().catch(() => null);
    const tumRoller = Array.from(guild.roles.cache.values())
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    const rolListesiMetni = tumRoller
        .slice(0, 60)
        .map((r, idx) => `${idx + 1}. ${r.name} (${r.members.size} üye)`)
        .join(' | ');

    // En üstteki 18 rolün sahiplerini listele (Başkomutan kim, Mareşal kim, Kurucu kim vb. soruları için)
    const ustKomutaSatirlari = [];
    for (const r of tumRoller.slice(0, 18)) {
        const uyeler = Array.from(r.members.values()).filter(m => !m.user.bot);
        if (uyeler.length > 0 && uyeler.length <= 12) {
            ustKomutaSatirlari.push(`• ${r.name}: ${uyeler.map(m => `${m.displayName} (@${m.user.username})`).join(', ')}`);
        }
    }

    // Kategoriler ve Kanallar
    const kategoriler = Array.from(guild.channels.cache.values())
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);
    const kanalHaritasi = [];
    for (const kat of kategoriler.slice(0, 15)) {
        const altKanallar = Array.from(guild.channels.cache.values())
            .filter(c => c.parentId === kat.id)
            .sort((a, b) => a.position - b.position)
            .map(c => `${c.type === ChannelType.GuildVoice ? '🔊' : '#'}${c.name}`);
        kanalHaritasi.push(`[${kat.name}]: ${altKanallar.join(', ') || 'Boş'}`);
    }
    const kategorisiz = Array.from(guild.channels.cache.values())
        .filter(c => !c.parentId && c.type !== ChannelType.GuildCategory)
        .map(c => `${c.type === ChannelType.GuildVoice ? '🔊' : '#'}${c.name}`);
    if (kategorisiz.length) kanalHaritasi.unshift(`[Genel]: ${kategorisiz.join(', ')}`);

    // Nöbet & Seviye Liderleri
    const nobetTop = Object.values(ayar.nobetSureleri || {})
        .sort((a, b) => (b.toplamSaniye || 0) - (a.toplamSaniye || 0))
        .slice(0, 5)
        .map((n, i) => `${i + 1}. ${n.username} (${Math.round((n.toplamSaniye || 0) / 60)} dk)`)
        .join(', ') || 'Kayıt yok';

    const seviyeTop = Object.values(ayar.leveling?.kullanicilar || {})
        .sort((a, b) => (b.seviye - a.seviye) || (b.xp - a.xp))
        .slice(0, 5)
        .map((u, i) => `${i + 1}. ${u.username} (Sv.${u.seviye})`)
        .join(', ') || 'Kayıt yok';

    const aktifOp = (ayar.operasyonlar || []).slice(0, 3)
        .map(o => `${o.baslik} (${o.tarihSaat} - ${o.katilanlar?.length || 0} katılımcı)`)
        .join(' | ') || 'Yok';

    const ozelKomutListesi = (ayar.ozelKomutlar || [])
        .map(k => `${ayar.prefix || '!'}${k.tetikleyici}`)
        .join(', ') || 'Yok';

    return [
        `[SUNUCU GENEL BİLGİLERİ]:`,
        `Sunucu Adı: ${guild.name} | Sunucu Sahibi (Owner): ${sahip ? `${sahip.displayName} (@${sahip.user.username})` : 'Bilinmiyor'} | Toplam Üye: ${guild.memberCount} | Çevrimiçi: ${guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size} | Açık Ticket: ${Object.keys(ayar.acikBiletler || {}).length} | Özel Komutlar: ${ozelKomutListesi}`,
        `
[SUNUCU ROL HİYERARŞİSİ (YUKARIDAN AŞAĞIYA)]:
${rolListesiMetni || 'Rol yok'}`,
        `
[ÜST KOMUTA & YÖNETİM KADROSU (ROLLERDEKİ KİŞİLER)]:
${ustKomutaSatirlari.join('\n') || 'Belirtilmemiş'}`,
        `
[SUNUCU KANALLARI]:
${kanalHaritasi.join('\n') || 'Kanal yok'}`,
        `
[AKTİF OPERASYONLAR & LİDERLİKLER]:
Operasyonlar: ${aktifOp} | Haftalık Nöbet İlk 5: ${nobetTop} | Seviye İlk 5: ${seviyeTop}`
    ].join('\n');
}

const aiModCooldown = new Map();
async function aiModerasyonDenetle(mesajIcerik) {
    const temiz = String(mesajIcerik || '').trim();
    if (!GEMINI_API_KEYS.length || temiz.length < 3) return null;
    // Sadece emoji, sayı veya çok kısa masum selamlaşmalarda API kotası harcama
    if (/^(selam|slm|sa|as|merhaba|mrb|naber|nbr|iyi|tamam|tm|ok|evet|hayır|hayir|aynen|eyw|sağol|sagol|lol|xd|hg|hb)[!.?\s]*$/i.test(temiz)) {
        return null;
    }
    try {
        const yanit = await geminiSor(
            'Sen bir Türkçe Discord moderasyon yapay zekasısın. Verilen mesajda ağır küfür, hakaret, ailevi değerlere sövgü veya taciz var mı analiz et. Günlük samimi konuşmaları (naber, la, kanka, dostum vb.) ihlal sayma. SADECE şu JSON formatında yanıt ver: {"ihlal": true/false, "sebep": "kısa Türkçe sebep"}',
            `Mesaj: "${temiz.slice(0, 350)}"`,
            [],
            120,
            'mod'
        );
        const match = yanit.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.ihlal === true) return parsed.sebep || 'AI Küfür/Hakaret Tespiti';
        }
    } catch (_) {}
    return null;
}

// Tam TSF Rütbe Listesi Metni (AI'ın "er subay" diye geçiştirmemesi için)
function tamRutbeListesiMetni(ayar) {
    const liste = ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;
    const gruplar = {};
    for (const r of liste) {
        if (!gruplar[r.sinif]) gruplar[r.sinif] = [];
        gruplar[r.sinif].push(r.ad);
    }
    return Object.entries(gruplar)
        .map(([sinif, adlar]) => `**${sinif}:**\n${adlar.map((a, i) => `${i + 1}. ${a}`).join('\n')}`)
        .join('\n\n');
}

// ============================================================================
// 7. ONARILMIŞ SES DİNLEME, WAV KAYIT + DISCORD ARŞİV + CANLI TTS ANONS
// ============================================================================
const aktifSesOturumlari = new Map();

function pcmToWavBuffer(pcmBuffer, sampleRate = 48000, channels = 2, bitDepth = 16) {
    const byteRate = (sampleRate * channels * bitDepth) / 8;
    const blockAlign = (channels * bitDepth) / 8;
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
}

function sseGonder(oturum, payload) {
    const satir = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of oturum.streamClients) {
        try { res.write(satir); } catch (_) { oturum.streamClients.delete(res); }
    }
}

// Discord'un gelen ses paketlerini (SSRC) bot için aktif etmesi adına 5 paket sessizlik gönderir
function sessizlikTetikle(connection) {
    try {
        if (!VoiceLib?.createAudioPlayer || !VoiceLib?.createAudioResource) return;
        const silenceFrame = Buffer.from([0xF8, 0xFF, 0xFE]);
        let count = 0;
        const stream = new Readable({
            read() {
                if (count < 5) {
                    count++;
                    this.push(silenceFrame);
                } else {
                    this.push(null);
                }
            }
        });
        const player = VoiceLib.createAudioPlayer();
        const resource = VoiceLib.createAudioResource(stream, { inputType: VoiceLib.StreamType.Opus });
        connection.subscribe(player);
        player.play(resource);
    } catch (_) {}
}

function paketCozucuOlustur() {
    if (NativeOpusEncoder) {
        try {
            const enc = new NativeOpusEncoder(48000, 2);
            return (packet) => enc.decode(packet);
        } catch (_) {}
    }
    if (OpusScriptClass) {
        try {
            const script = new OpusScriptClass(48000, 2, OpusScriptClass.Application.AUDIO);
            return (packet) => Buffer.from(script.decode(packet));
        } catch (_) {}
    }
    return null;
}

async function sesDinlemeBaslat(guild, kanalId, kayitYap = true) {
    if (!VoiceLib) throw new Error('Sunucuda @discordjs/voice paketi kurulu değil.');
    if (sodiumReadyPromise) await sodiumReadyPromise.catch(() => {});
    if (aktifSesOturumlari.has(guild.id)) await sesDinlemeDurdur(guild.id);

    const kanal = guild.channels.cache.get(kanalId);
    if (!kanal || kanal.type !== ChannelType.GuildVoice) {
        throw new Error('Geçerli bir ses kanalı seçin.');
    }

    const testCozucu = paketCozucuOlustur();
    if (!testCozucu) {
        throw new Error('Sunucuda Opus ses çözücü (opusscript / @discordjs/opus) bulunamadı.');
    }

    const connection = VoiceLib.joinVoiceChannel({
        channelId: kanal.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    if (VoiceLib.entersState && VoiceLib.VoiceConnectionStatus) {
        try {
            await VoiceLib.entersState(connection, VoiceLib.VoiceConnectionStatus.Ready, 15_000);
        } catch (_) {
            try { connection.destroy(); } catch (__) {}
            throw new Error('Ses kanalına bağlanılamadı. Botun ses kanalına bağlanma ve konuşma izinlerini kontrol edin.');
        }
    }

    // KRİTİK: Discord'un ses alımını (UDP RX) başlatması için sessizlik çerçevesi gönder
    sessizlikTetikle(connection);

    const oturum = {
        kanalId: kanal.id,
        kanalAdi: kanal.name,
        connection,
        streamClients: new Set(),
        kayitYap: !!kayitYap,
        pcmChunks: [],
        aktifStreamler: new Map(),
        alinanPaket: 0,
        cozulenByte: 0,
        baslangic: Date.now()
    };

    aktifSesOturumlari.set(guild.id, oturum);

    const aboneOl = (userId) => {
        if (!userId || userId === client.user?.id || oturum.aktifStreamler.has(userId)) return;
        const decodeFn = paketCozucuOlustur();
        if (!decodeFn) return;

        try {
            const opusStream = connection.receiver.subscribe(userId, {
                end: { behavior: VoiceLib.EndBehaviorType.Manual }
            });
            oturum.aktifStreamler.set(userId, opusStream);

            opusStream.on('data', (packet) => {
                if (!packet || packet.length <= 3) return; // 3 baytlık Discord sessizlik/DTX paketini atla
                oturum.alinanPaket += 1;
                try {
                    const pcm = decodeFn(packet);
                    if (pcm && pcm.length > 0) {
                        oturum.cozulenByte += pcm.length;
                        if (oturum.kayitYap) oturum.pcmChunks.push(Buffer.from(pcm));
                        if (oturum.streamClients.size > 0) {
                            sseGonder(oturum, {
                                type: 'audio',
                                userId,
                                pcm: pcm.toString('base64'),
                                paket: oturum.alinanPaket
                            });
                        }
                    }
                } catch (_) {
                    // Tekil bozuk paketi yut, akışı kesinlikle durdurma!
                }
            });

            const temizle = () => oturum.aktifStreamler.delete(userId);
            opusStream.on('end', temizle);
            opusStream.on('error', temizle);
        } catch (err) {
            console.warn('Ses abonelik uyarısı:', err.message);
            oturum.aktifStreamler.delete(userId);
        }
    };

    for (const [mId, member] of kanal.members) {
        if (!member.user.bot) aboneOl(mId);
    }

    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
        const uye = guild.members.cache.get(userId);
        const ad = uye ? uye.displayName : userId;
        sseGonder(oturum, { type: 'speaking', userId, kullaniciAdi: ad, durum: true });
        aboneOl(userId);
    });

    receiver.speaking.on('end', (userId) => {
        sseGonder(oturum, { type: 'speaking', userId, durum: false });
    });

    return oturum;
}

async function sesDinlemeDurdur(guildId) {
    const oturum = aktifSesOturumlari.get(guildId);
    if (!oturum) return null;

    for (const opusStream of oturum.aktifStreamler.values()) {
        try { opusStream.destroy(); } catch (_) {}
    }
    oturum.aktifStreamler.clear();
    await new Promise(r => setTimeout(r, 150));

    try { oturum.connection.destroy(); } catch (_) {}
    for (const res of oturum.streamClients) {
        try { res.end(); } catch (_) {}
    }
    aktifSesOturumlari.delete(guildId);

    const bilgi = { dosyaAdi: null, alinanPaket: oturum.alinanPaket, cozulenByte: oturum.cozulenByte, discordUrl: '' };

    if (oturum.kayitYap && oturum.pcmChunks.length > 0) {
        const toplamPcm = Buffer.concat(oturum.pcmChunks);
        const wavBuffer = pcmToWavBuffer(toplamPcm);
        const dosyaAdi = `kayit_${guildId}_${Date.now()}.wav`;
        fs.writeFileSync(path.join(KAYITLAR_DIR, dosyaAdi), wavBuffer);

        const sureSaniye = Math.max(1, Math.round(toplamPcm.length / (48000 * 2 * 2)));
        let discordUrl = '';

        // Discord Ses Arşiv Kanalına Kalıcı Yedekle (Render disk silinse bile kaybolmaz!)
        const guild = client.guilds.cache.get(guildId);
        const ayar = sunucuAyarGetir(guildId);
        const arsivKanalId = ayar.sesArsivKanal || ayar.sesLogKanal;
        if (guild && arsivKanalId && wavBuffer.length < 24 * 1024 * 1024) {
            const arsivKanal = guild.channels.cache.get(arsivKanalId);
            if (arsivKanal) {
                try {
                    const attachment = new AttachmentBuilder(wavBuffer, { name: dosyaAdi });
                    const msg = await arsivKanal.send({
                        content: `📼 **Ses Kaydı Arşivlendi** | Kanal: **#${oturum.kanalAdi}** | Süre: **${sureSaniye} sn**`,
                        files: [attachment]
                    });
                    discordUrl = msg.attachments.first()?.url || '';
                } catch (e) {
                    console.warn('Discord ses yedekleme uyarısı:', e.message);
                }
            }
        }

        bilgi.dosyaAdi = dosyaAdi;
        bilgi.discordUrl = discordUrl;

        db.sesKayitlari.unshift({
            id: crypto.randomUUID(),
            guildId,
            kanalAdi: oturum.kanalAdi,
            dosyaAdi,
            discordUrl,
            sureSaniye,
            tutanak: '',
            tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
        dbKaydet(true);
    }

    return bilgi;
}

// Canlı Telsiz / TTS Anons Oynatıcı
async function sesKanalinaAnonsYap(guild, kanalId, metin) {
    if (!VoiceLib) throw new Error('@discordjs/voice yüklü değil.');
    if (sodiumReadyPromise) await sodiumReadyPromise.catch(() => {});
    const kanal = guild.channels.cache.get(kanalId);
    if (!kanal || kanal.type !== ChannelType.GuildVoice) throw new Error('Geçerli bir ses kanalı seçin.');

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=tr&client=tw-ob&q=${encodeURIComponent(metin.slice(0, 200))}`;
    const res = await guvenliFetch(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error('TTS ses servisi yanıt vermedi.');
    const audioBuf = Buffer.from(await res.arrayBuffer());

    const connection = VoiceLib.joinVoiceChannel({
        channelId: kanal.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    await VoiceLib.entersState(connection, VoiceLib.VoiceConnectionStatus.Ready, 12_000).catch(() => {});
    const player = VoiceLib.createAudioPlayer();
    const resource = VoiceLib.createAudioResource(Readable.from(audioBuf));
    connection.subscribe(player);
    player.play(resource);

    player.on(VoiceLib.AudioPlayerStatus.Idle, () => {
        setTimeout(() => {
            if (!aktifSesOturumlari.has(guild.id)) {
                try { connection.destroy(); } catch (_) {}
            }
        }, 1200);
    });
}

// ============================================================================
// 8. DISCORD BOT İSTEMCİSİ VE TEKİL SLASH KOMUTLAR (ÇİFT KOMUT FİX)
// ============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

const slashKomutlar = [
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Roblox hesabınızı Discord hesabınıza bağlar (OAuth 2.0 veya Profil Kodu)')
        .addSubcommand(sub =>
            sub.setName('oauth2')
                .setDescription('RoWifi tarzı resmi Roblox OAuth 2.0 ile tek tıkla doğrulama bağlantısı verir')
        )
        .addSubcommand(sub =>
            sub.setName('kod-al')
                .setDescription('Roblox profil açıklamanıza yazacağınız doğrulama kodunu oluşturur')
                .addStringOption(opt => opt.setName('roblox_adi').setDescription('Roblox kullanıcı adınız').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('onayla')
                .setDescription('Roblox profil açıklamanıza eklediğiniz kodu onaylayıp hesabınızı bağlar')
        )
        .addSubcommand(sub =>
            sub.setName('durum')
                .setDescription('Mevcut Roblox doğrulama durumunuzu gösterir')
        ),
    new SlashCommandBuilder()
        .setName('rütbe')
        .setDescription('TSF Roblox rütbe yönetimi (Discord rolleri /update ile eşitlenir)')
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('TSF Roblox grubunda rütbe verir (kendi rütbenden yüksek veremezsin)')
                .addStringOption(opt => opt.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true))
                .addStringOption(opt => opt.setName('rutbe').setDescription('Verilecek TSF rütbesi').setRequired(true).setAutocomplete(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('sorgula')
                .setDescription('Oyuncunun TSF Roblox rütbesini sorgular')
                .addStringOption(opt => opt.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('liste')
                .setDescription('Güncel TSF rütbe hiyerarşisini listeler')
        ),
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('Roblox rütbenize göre Discord rollerinizi günceller (Eklenen / Çıkarılan Roller)')
        .addUserOption(opt => opt.setName('uye').setDescription('Güncellenecek üye (boşsa kendiniz)').setRequired(false))
        .addStringOption(opt => opt.setName('roblox_adi').setDescription('Doğrulanmadıysa Roblox kullanıcı adınız').setRequired(false)),

    new SlashCommandBuilder()
        .setName('sınav')
        .setDescription('Acemi Eğitimi & Otomatik Terfi Sınavı')
        .addSubcommand(sub => sub.setName('baslat').setDescription('Acemi Er -> Onbaşı terfi sınavını başlatır')),
    new SlashCommandBuilder()
        .setName('sicil')
        .setDescription('Madalya, bröve ve disiplin (inzibat) kayıtları')
        .addSubcommand(sub =>
            sub.setName('madalya-ver')
                .setDescription('Personele madalya veya bröve verir')
                .addUserOption(opt => opt.setName('uye').setDescription('Personel').setRequired(true))
                .addStringOption(opt => opt.setName('madalya').setDescription('Madalya / Bröve adı').setRequired(true))
                .addStringOption(opt => opt.setName('aciklama').setDescription('Verilme sebebi').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('disiplin-ekle')
                .setDescription('Personele inzibat / disiplin kaydı işler')
                .addUserOption(opt => opt.setName('uye').setDescription('Personel').setRequired(true))
                .addStringOption(opt => opt.setName('tur').setDescription('Ceza türü (Kınama / Gözaltı / Rütbe Tenzili)').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('karaliste')
        .setDescription('Ortak Kara Liste (Blacklist) yönetimi')
        .addSubcommand(sub =>
            sub.setName('ekle')
                .setDescription('Bir kişiyi kara listeye alır')
                .addStringOption(opt => opt.setName('sebep').setDescription('Kara liste sebebi').setRequired(true))
                .addUserOption(opt => opt.setName('discord_uye').setDescription('Discord üyesi').setRequired(false))
                .addStringOption(opt => opt.setName('roblox_adi').setDescription('Roblox kullanıcı adı').setRequired(false))
        )
        .addSubcommand(sub => sub.setName('liste').setDescription('Kara listedeki kayıtları gösterir')),
    new SlashCommandBuilder()
        .setName('çekiliş')
        .setDescription('Detaylı ve şartlı çekiliş sistemi')
        .addSubcommand(sub =>
            sub.setName('baslat')
                .setDescription('Yeni bir çekiliş başlatır')
                .addStringOption(opt => opt.setName('odul').setDescription('Çekiliş ödülü').setRequired(true))
                .addIntegerOption(opt => opt.setName('sure_dakika').setDescription('Süre (dakika)').setMinValue(1).setMaxValue(43200).setRequired(true))
                .addIntegerOption(opt => opt.setName('kazanan_sayisi').setDescription('Kazanan sayısı').setMinValue(1).setMaxValue(20).setRequired(false))
                .addRoleOption(opt => opt.setName('sart_rol').setDescription('Katılım için gerekli rol (opsiyonel)').setRequired(false))
                .addIntegerOption(opt => opt.setName('sart_seviye').setDescription('Minimum seviye şartı (opsiyonel)').setMinValue(0).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('bitir')
                .setDescription('Aktif bir çekilişi erken bitirip kazananları açıklar')
                .addStringOption(opt => opt.setName('id').setDescription('Çekiliş ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('yeniden-cek')
                .setDescription('Bitmiş bir çekiliş için yeni kazanan seçer (Reroll)')
                .addStringOption(opt => opt.setName('id').setDescription('Çekiliş ID').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('moderasyon')
        .setDescription('Komuta ve disiplin moderasyon işlemleri')
        .addSubcommand(sub =>
            sub.setName('uyar')
                .setDescription('Resmi uyarı verir ve uyarı merdivenini uygular')
                .addUserOption(opt => opt.setName('uye').setDescription('Uyarılacak üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Uyarı sebebi').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('uyarilar')
                .setDescription('Personelin uyarı kayıtlarını gösterir')
                .addUserOption(opt => opt.setName('uye').setDescription('Personel').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('sustur')
                .setDescription('Üyeyi süreli susturur (timeout)')
                .addUserOption(opt => opt.setName('uye').setDescription('Üye').setRequired(true))
                .addIntegerOption(opt => opt.setName('dakika').setDescription('Süre (dk)').setMinValue(1).setMaxValue(10080).setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('at')
                .setDescription('Üyeyi sunucudan atar')
                .addUserOption(opt => opt.setName('uye').setDescription('Üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('yasakla')
                .setDescription('Üyeyi sunucudan yasaklar')
                .addUserOption(opt => opt.setName('uye').setDescription('Üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('temizle')
                .setDescription('Kanaldaki mesajları siler')
                .addIntegerOption(opt => opt.setName('adet').setDescription('Adet (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('kilit')
                .setDescription('Kanalı kilitler veya açar')
                .addBooleanOption(opt => opt.setName('durum').setDescription('True = Kilitle, False = Aç').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('ses-odasi')
        .setDescription('Özel veya herkese açık ses odası oluşturur')
        .addSubcommand(sub =>
            sub.setName('olustur')
                .setDescription('Yeni ses odası oluşturur')
                .addStringOption(opt => opt.setName('isim').setDescription('Oda ismi').setRequired(true))
                .addIntegerOption(opt => opt.setName('limit').setDescription('Kişi limiti (0=Sınırsız)').setMinValue(0).setMaxValue(99).setRequired(false))
                .addBooleanOption(opt => opt.setName('ozel').setDescription('Özel/Kilitli olsun mu?').setRequired(false))
                .addUserOption(opt => opt.setName('izinli_uye').setDescription('İzinli üye').setRequired(false))
                .addRoleOption(opt => opt.setName('izinli_rol').setDescription('İzinli rol').setRequired(false))
        ),
    new SlashCommandBuilder()
        .setName('anons')
        .setDescription('Ses kanalına canlı telsiz/TTS anonsu yapar')
        .addChannelOption(opt => opt.setName('kanal').setDescription('Ses kanalı').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .addStringOption(opt => opt.setName('mesaj').setDescription('Okunacak anons metni').setRequired(true)),
    new SlashCommandBuilder()
        .setName('izin')
        .setDescription('İzin / Mazeret (LOA) talep sistemi')
        .addSubcommand(sub =>
            sub.setName('talep')
                .setDescription('Mazeret/LOA talebi oluşturur')
                .addIntegerOption(opt => opt.setName('gun').setDescription('Süre (gün)').setMinValue(1).setMaxValue(60).setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('kimlik')
        .setDescription('Personel sicil, rütbe, madalya, disiplin ve nöbet kartı')
        .addUserOption(opt => opt.setName('uye').setDescription('Personel').setRequired(false)),
    new SlashCommandBuilder()
        .setName('yardim')
        .setDescription('ORDU YÖNETİMİ botunun tüm komutlarını gösterir')
];

// ÇİFT KOMUT SORUNUNU KESİN ÇÖZEN KAYIT MOTORU:
// Eski sunucu bazlı (guild) komut kopyalarını sıfırlar, yalnızca tekil Global komutları yükler.
async function slashKomutlariKaydet() {
    if (!DISCORD_TOKEN || !CLIENT_ID) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const body = slashKomutlar.map(c => c.toJSON());
    try {
        for (const guild of client.guilds.cache.values()) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] }).catch(() => {});
        }
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
        console.log('⚡ Çift komut kopyaları temizlendi ve tüm Slash komutları tekil olarak kaydedildi.');
    } catch (err) {
        console.error('⚠️ Slash komut kayıt uyarısı:', err.message);
    }
}

client.on('guildCreate', async (guild) => {
    if (!DISCORD_TOKEN || !CLIENT_ID) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] }).catch(() => {});
});

// Çekiliş Sonlandırma Motoru
async function cekilisSonlandir(guild, ayar, cekilis, reroll = false) {
    const katilanlar = [...(cekilis.katilanlar || [])];
    const kazananSayisi = Math.min(cekilis.kazananSayisi || 1, katilanlar.length);
    const karisik = katilanlar.sort(() => Math.random() - 0.5);
    const kazananlar = karisik.slice(0, kazananSayisi);

    cekilis.bitti = true;
    cekilis.kazananlar = kazananlar;
    dbKaydet();

    const kanal = guild.channels.cache.get(cekilis.kanalId);
    if (!kanal) return kazananlar;

    const kazananMetin = kazananlar.length ? kazananlar.map(id => `<@${id}>`).join(', ') : 'Yeterli katılım olmadığı için kazanan çıkmadı.';
    const msg = await kanal.messages.fetch(cekilis.mesajId).catch(() => null);
    if (msg) {
        const embed = new EmbedBuilder()
            .setColor('#10b981')
            .setTitle(`🎉 ÇEKİLİŞ TAMAMLANDI: ${cekilis.odul}`)
            .setDescription(`**Kazanan(lar):** ${kazananMetin}\n**Toplam Katılımcı:** ${katilanlar.length} kişi\n**Çekiliş ID:** \`${cekilis.id}\``)
            .setTimestamp();
        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    await kanal.send({
        content: kazananlar.length
            ? `🎊 ${reroll ? '**[YENİDEN ÇEKİM]** ' : ''}Tebrikler ${kazananMetin}! **${cekilis.odul}** çekilişini kazandınız!`
            : `ℹ️ **${cekilis.odul}** çekilişi katılımcı olmadığı için kazanan olmadan sonlandı.`
    }).catch(() => {});

    logEkle(guild.id, 'CEKILIS', reroll ? 'Çekiliş Yeniden Çekildi' : 'Çekiliş Sonlandı', `${cekilis.odul} — Kazanan: ${kazananlar.join(', ') || 'Yok'}`, 'Sistem');
    return kazananlar;
}

// Uyarı Merdiveni Uygulayıcı (Panelden Ayarlanan Kurallar)
async function uyariEkleVeMerdivenUygula(guild, member, ayar, yetkiliTag, sebep) {
    ayar.uyarilar.unshift({
        id: crypto.randomUUID(),
        kullaniciId: member.id,
        kullaniciTag: member.user.tag,
        yetkili: yetkiliTag,
        sebep,
        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
    });
    const toplam = ayar.uyarilar.filter(u => u.kullaniciId === member.id).length;
    const kurallar = (ayar.automod?.uyariKurallari || VARSAYILAN_UYARI_KURALLARI).sort((a, b) => a.esik - b.esik);
    const eslesenKural = kurallar.find(k => Number(k.esik) === toplam);

    let uygulananCeza = 'Resmi Uyarı Kaydedildi';
    if (eslesenKural && String(member.id) !== SUPER_ADMIN_ID) {
        if (eslesenKural.aksiyon === 'timeout') {
            const dk = Math.max(1, Number(eslesenKural.sureDk) || 10);
            await member.timeout(dk * 60 * 1000, `Uyarı Merdiveni (${toplam}. uyarı): ${sebep}`).catch(() => {});
            uygulananCeza = `${dk} dakika susturma (Timeout)`;
        } else if (eslesenKural.aksiyon === 'kick') {
            await member.kick(`Uyarı Merdiveni (${toplam}. uyarı): ${sebep}`).catch(() => {});
            uygulananCeza = 'Sunucudan Atıldı (Kick)';
        } else if (eslesenKural.aksiyon === 'ban') {
            await member.ban({ reason: `Uyarı Merdiveni (${toplam}. uyarı): ${sebep}` }).catch(() => {});
            uygulananCeza = 'Kalıcı Yasaklandı (Ban)';
        }
    }

    dbKaydet();
    return { toplam, uygulananCeza };
}

client.once('ready', async () => {
    console.log(`👑 ORDU YÖNETİMİ v5.1 Bot Aktif: ${client.user.tag} | Opus Motoru: ${opusEngineName}`);
    client.user.setActivity('TSF Komuta Ağı | /verify & /yardim', { type: 3 });
    await slashKomutlariKaydet();

    // Sunucu üyelerini ön belleğe al (AI ve Sicil sorguları eksiksiz çalışsın)
    for (const guild of client.guilds.cache.values()) {
        guild.members.fetch().catch(() => {});
    }

    // Periyodik Çekiliş & LOA Kontrolü (15 saniyede bir)
    setInterval(async () => {
        const simdi = Date.now();
        for (const [guildId, ayar] of Object.entries(db.sunucular)) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            // Çekiliş Süre Kontrolü
            for (const c of (ayar.cekilisler || [])) {
                if (!c.bitti && c.bitisTimestamp && simdi >= c.bitisTimestamp) {
                    await cekilisSonlandir(guild, ayar, c, false).catch(() => {});
                }
            }

            // LOA Süre Kontrolü
            let loaDegisti = false;
            for (const loa of (ayar.loaTalepleri || [])) {
                if (loa.durum === 'onaylandi' && loa.bitisTimestamp && simdi >= loa.bitisTimestamp) {
                    loa.durum = 'tamamlandi';
                    loaDegisti = true;
                    const member = await guild.members.fetch(loa.userId).catch(() => null);
                    const rol = (ayar.izinliRolId && guild.roles.cache.get(ayar.izinliRolId))
                        || guild.roles.cache.find(r => r.name.toLowerCase().includes('izinli'));
                    if (member && rol && member.roles.cache.has(rol.id)) {
                        await member.roles.remove(rol).catch(() => {});
                    }
                    logEkle(guildId, 'LOA', 'İzin Süresi Doldu', `${loa.username} görevine döndü`, 'Sistem');
                }
            }
            if (loaDegisti) dbKaydet();
        }
    }, 15_000);
});

client.on('error', (err) => console.error('⚠️ Discord Client Hatası:', err?.message || err));

async function modLogEmbedGonder(guild, ayar, embed) {
    const hedefId = ayar.modLogKanal || ayar.mesajLogKanal;
    if (!hedefId) return;
    const kanal = guild.channels.cache.get(hedefId);
    if (kanal) await kanal.send({ embeds: [embed] }).catch(() => {});
}

// Aktif Sınav Oturumları: `${guildId}_${userId}` -> { index, dogruSayisi, sorular }
const aktifSinavlar = new Map();

function sinavSoruMesajiOlustur(oturum) {
    const s = oturum.sorular[oturum.index];
    const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(`📝 TSF Acemi Eğitimi Sınavı (Soru ${oturum.index + 1}/${oturum.sorular.length})`)
        .setDescription(`**${s.soru}**\n\n` + s.secenekler.map((sec, i) => `**${['A', 'B', 'C', 'D'][i]})** ${sec}`).join('\n'));

    const row = new ActionRowBuilder().addComponents(
        s.secenekler.map((_, i) => new ButtonBuilder()
            .setCustomId(`sinav_cevap_${i}`)
            .setLabel(['A', 'B', 'C', 'D'][i])
            .setStyle(ButtonStyle.Primary))
    );
    return { embeds: [embed], components: [row], ephemeral: true };
}

// ============================================================================
// 9. ETKİLEŞİMLER (SLASH, AUTOCOMPLETE, BUTONLAR, MODALLAR)
// ============================================================================
client.on('interactionCreate', async (interaction) => {
    try {
        // 1. AUTOCOMPLETE
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'rütbe') {
                const aranan = turkceNormalize(interaction.options.getFocused());
                const ayar = sunucuAyarGetir(interaction.guildId);
                let roller = await robloxGrupRolleriniGetir(ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID).catch(() => []);
                if (roller.length === 0) {
                    roller = (ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER).map((r, idx) => ({ id: r.ad, name: r.ad, rank: idx + 1 }));
                }
                const filtrelenmis = roller
                    .filter(r => r.rank > 0 && r.rank < 255)
                    .filter(r => !aranan || turkceNormalize(r.name).includes(aranan))
                    .slice(0, 25)
                    .map(r => ({ name: `${r.name} (Rank ${r.rank})`, value: String(r.id) }));
                await interaction.respond(filtrelenmis);
            }
            return;
        }

        // 2. SLASH KOMUTLAR
        if (interaction.isChatInputCommand()) {
            const ayar = sunucuAyarGetir(interaction.guildId);
            const superMi = interaction.user.id === SUPER_ADMIN_ID;
            const yoneticiMi = superMi || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (interaction.commandName === 'yardim') {
                const embed = new EmbedBuilder()
                    .setColor(ayar.tema.primary || '#3b82f6')
                    .setTitle(`🎖️ ${ayar.tema.baslik} — Komuta Rehberi`)
                    .addFields(
                        { name: '🎖️ Rütbe & Doğrulama', value: '`/verify` — RoWifi tarzı resmi Roblox OAuth 2.0 girişi ile hesabını doğrula\n`/update` — Roblox rütbene göre Discord rollerini güncelle\n`/doğrula oauth` / `baslat` / `onayla` — Alternatif doğrulama\n`/rütbe ver` / `sorgula` / `liste` — Rütbe yönetimi\n`/sınav baslat` — Acemi Er -> Onbaşı terfi sınavı' },
                        { name: '🪪 Sicil, Kara Liste & Çekiliş', value: '`/kimlik` — Rütbe, madalya, disiplin ve nöbet kartı\n`/sicil madalya-ver` / `disiplin-ekle`\n`/karaliste ekle` / `liste`\n`/çekiliş baslat` / `bitir` / `yeniden-cek`' },
                        { name: '⚖️ Moderasyon & Ses', value: '`/moderasyon uyar/uyarilar/sustur/at/yasakla/temizle/kilit`\n`/ses-odasi olustur` • `/anons` • `/izin talep`' }
                    );
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // /verify KOMUTU (OAuth 2.0 + Profil Kodu + Durum)
            if (interaction.commandName === 'verify') {
                const alt = interaction.options.getSubcommand();

                if (alt === 'durum') {
                    const kayit = verifyKaydiBulDiscordIle(interaction.user.id, ayar);
                    if (!kayit) {
                        return interaction.reply({
                            content: '❌ Henüz Roblox hesabınızı doğrulamadınız. `/verify oauth2` veya `/verify kod-al` komutunu kullanın.',
                            ephemeral: true
                        });
                    }
                    const embed = new EmbedBuilder()
                        .setColor('#10b981')
                        .setTitle('✅ Roblox Hesap Doğrulama Durumu')
                        .setThumbnail('https://www.roblox.com/headshot-thumbnail/image?userId=' + kayit.robloxId + '&width=150&height=150&format=png')
                        .addFields(
                            { name: '🎮 Roblox Kullanıcı Adı', value: '**' + kayit.robloxUsername + '**', inline: true },
                            { name: '🆔 Roblox ID', value: '`' + kayit.robloxId + '`', inline: true },
                            { name: '🔐 Yöntem / Tarih', value: (kayit.yontem || 'Doğrulandı') + ' (' + (kayit.tarih || '-') + ')', inline: false }
                        );
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (alt === 'oauth2') {
                    const link = robloxOAuthLinkOlustur(interaction.user.id, interaction.guildId);
                    const mevcut = verifyKaydiBulDiscordIle(interaction.user.id, ayar);
                    const desc = (mevcut ? 'Mevcut bağlı hesabınız: **' + mevcut.robloxUsername + '** (`' + mevcut.robloxId + '`)\n\n' : '')
                        + '1️⃣ Aşağıdaki **"Roblox ile Giriş Yap"** butonuna tıklayın.\n'
                        + '2️⃣ Açılan resmi `roblox.com` ekranında hesabınıza giriş yapıp onaylayın.\n'
                        + '3️⃣ Doğrulama tamamlandığında TSF rütbe rolleriniz otomatik güncellenir.\n\n'
                        + '*(İsterseniz `/verify kod-al <roblox_adi>` ile profil biyografisine kod yazarak da doğrulayabilirsiniz.)*';
                    const embed = new EmbedBuilder()
                        .setColor('#3b82f6')
                        .setTitle('🛡️ Roblox Hesap Doğrulama (OAuth 2.0)')
                        .setDescription(desc)
                        .setFooter({ text: 'Resmi Roblox OAuth 2.0 • 10 dakika geçerlidir' });
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('🔗 Roblox ile Giriş Yap (OAuth 2.0)').setStyle(ButtonStyle.Link).setURL(link)
                    );
                    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                }

                if (alt === 'kod-al') {
                    await interaction.deferReply({ ephemeral: true });
                    const rAdi = interaction.options.getString('roblox_adi');
                    const rUser = await robloxKullaniciBul(rAdi);
                    const kod = 'TSF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
                    if (!db.pendingVerifications) db.pendingVerifications = {};
                    const obj = { robloxId: rUser.id, robloxUsername: rUser.username, kod, zaman: Date.now() };
                    db.pendingVerifications[interaction.user.id] = obj;
                    ayar.bekleyenDogrulamalar[interaction.user.id] = obj;
                    dbKaydet();

                    const embed = new EmbedBuilder()
                        .setColor('#3b82f6')
                        .setTitle('🔐 Roblox Profil Kodu Doğrulama (/verify)')
                        .setThumbnail(rUser.avatarUrl)
                        .setDescription('**' + rUser.username + '** hesabını bağlamak için aşağıdaki kodu Roblox profilinizin **About / Biyografi** kısmına yapıştırıp kaydedin:\n\n```\n' + kod + '\n```\nKaydettikten sonra aşağıdaki **✅ Kodu Onayla** butonuna basın veya `/verify onayla` yazın.');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('verify_kod_onayla_btn').setLabel('✅ Kodu Onayla (Verify)').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setLabel('🌐 Roblox Profilini Aç').setStyle(ButtonStyle.Link).setURL('https://www.roblox.com/users/' + rUser.id + '/profile')
                    );
                    return interaction.editReply({ embeds: [embed], components: [row] });
                }

                if (alt === 'onayla') {
                    await interaction.deferReply({ ephemeral: true });
                    const bekleyen = db.pendingVerifications?.[interaction.user.id] || ayar.bekleyenDogrulamalar?.[interaction.user.id];
                    if (!bekleyen) return interaction.editReply('❌ Aktif kodunuz yok. Önce `/verify kod-al <roblox_adi>` kullanın.');
                    const detay = await robloxKullaniciDetayGetir(bekleyen.robloxId);
                    if (!String(detay.description || '').includes(bekleyen.kod)) {
                        return interaction.editReply('❌ Profil açıklamanızda `' + bekleyen.kod + '` kodu bulunamadı! Kaydedip tekrar deneyin.');
                    }
                    const kara = (ayar.karaListe || []).find(k => k.robloxId === bekleyen.robloxId || k.discordId === interaction.user.id);
                    if (kara) return interaction.editReply('⛔ Bu hesap ortak kara listededir! Sebep: **' + kara.sebep + '**');
                    verifyKaydet(interaction.user.id, bekleyen.robloxId, bekleyen.robloxUsername, 'Profil Kodu', interaction.guildId);
                    delete db.pendingVerifications[interaction.user.id];
                    delete ayar.bekleyenDogrulamalar[interaction.user.id];
                    logEkle(interaction.guildId, 'RUTBE', 'Roblox Verify (Profil Kodu)', interaction.user.tag + ' ↔ ' + bekleyen.robloxUsername, interaction.user.tag);
                    return interaction.editReply('✅ Hesabınız **' + bekleyen.robloxUsername + '** olarak doğrulandı! Şimdi `/update` yazarak rollerinizi alabilirsiniz.');
                }
            }

            if (interaction.commandName === 'update') {
                const hedefUser = interaction.options.getUser('uye') || interaction.user;
                const rAdi = interaction.options.getString('roblox_adi');
                const dogrulama = ayar.dogrulamalar?.[hedefUser.id];

                // Eğer kullanıcı henüz doğrulanmamışsa ve kendi için /update yazdıysa RoWifi gibi OAuth 2.0 giriş linki ver
                if (!dogrulama && !rAdi && hedefUser.id === interaction.user.id && ROBLOX_CLIENT_ID) {
                    const link = robloxOAuthLinkOlustur(interaction.user.id, interaction.guildId);
                    const embed = new EmbedBuilder()
                        .setColor('#f59e0b')
                        .setTitle('⚠️ Roblox Hesabınız Henüz Bağlı Değil')
                        .setDescription('Rütbe rollerinizi güncelleyebilmem için önce resmi Roblox hesabınızla giriş yaparak doğrulama yapmanız gerekiyor.\n\nAşağıdaki butona basıp giriş yaptıktan sonra rolleriniz otomatik verilecektir:');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('🔗 Roblox ile Giriş Yap & Güncelle').setStyle(ButtonStyle.Link).setURL(link)
                    );
                    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                }

                await interaction.deferReply();
                const hedefMember = await interaction.guild.members.fetch(hedefUser.id);
                const sonuc = await kullaniciRolleriniGuncelle(interaction.guild, hedefMember, ayar, rAdi);

                const eklenenTxt = sonuc.eklenenRoller.length ? sonuc.eklenenRoller.map(r => `➕ <@&${r.id}>`).join('\n') : '• Eklenen rol yok';
                const cikarilanTxt = sonuc.cikarilanRoller.length ? sonuc.cikarilanRoller.map(r => `➖ <@&${r.id}>`).join('\n') : '• Çıkarılan rol yok';

                const embed = new EmbedBuilder()
                    .setColor('#10b981')
                    .setTitle('🔄 TSF Rol Güncellemesi Tamamlandı (/update)')
                    .setThumbnail(sonuc.robloxUser.avatarUrl)
                    .addFields(
                        { name: '👤 Personel', value: `${hedefUser} (**${sonuc.robloxUser.username}**)`, inline: true },
                        { name: '🎖️ Güncel Roblox Rütbesi', value: `**${sonuc.grupBilgi.roleName}** (Rank ${sonuc.grupBilgi.rank})`, inline: true },
                        { name: '🟢 Eklenen Roller', value: eklenenTxt, inline: false },
                        { name: '🔴 Çıkarılan Roller', value: cikarilanTxt, inline: false }
                    )
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (interaction.commandName === 'sınav') {
                if (!ayar.moduller.sinav) return interaction.reply({ content: '❌ Sınav sistemi şu an kapalı.', ephemeral: true });
                const sorular = ayar.sinavAyar?.sorular || VARSAYILAN_SINAV_SORULARI;
                if (!sorular.length) return interaction.reply({ content: '❌ Sınav sorusu tanımlı değil.', ephemeral: true });
                const key = `${interaction.guildId}_${interaction.user.id}`;
                const oturum = { index: 0, dogruSayisi: 0, sorular };
                aktifSinavlar.set(key, oturum);
                return interaction.reply(sinavSoruMesajiOlustur(oturum));
            }

            if (interaction.commandName === 'sicil') {
                if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                    return interaction.reply({ content: '❌ Bu işlem için yetkiniz yok.', ephemeral: true });
                }
                const alt = interaction.options.getSubcommand();
                const hedef = interaction.options.getUser('uye');
                if (!ayar.sicilKayitlari[hedef.id]) ayar.sicilKayitlari[hedef.id] = { madalyalar: [], disiplin: [] };
                const tarih = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

                if (alt === 'madalya-ver') {
                    const madalya = interaction.options.getString('madalya');
                    const aciklama = interaction.options.getString('aciklama') || 'Üstün başarı';
                    ayar.sicilKayitlari[hedef.id].madalyalar.unshift({ id: crypto.randomUUID(), ad: madalya, aciklama, yetkili: interaction.user.tag, tarih });
                    logEkle(interaction.guildId, 'SICIL', 'Madalya Verildi', `${hedef.tag}: ${madalya}`, interaction.user.tag);
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#f59e0b').setTitle('🏅 Madalya / Bröve Taltifi').setDescription(`**${hedef}** personeline **${madalya}** verildi!\n📝 ${aciklama}`)] });
                }
                if (alt === 'disiplin-ekle') {
                    const tur = interaction.options.getString('tur');
                    const sebep = interaction.options.getString('sebep');
                    ayar.sicilKayitlari[hedef.id].disiplin.unshift({ id: crypto.randomUUID(), tur, sebep, yetkili: interaction.user.tag, tarih });
                    logEkle(interaction.guildId, 'SICIL', 'Disiplin Cezası İşlendi', `${hedef.tag}: [${tur}] ${sebep}`, interaction.user.tag);
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#ef4444').setTitle('⚖️ İnzibat / Disiplin Sicil Kaydı').setDescription(`**${hedef}** siciline **${tur}** işlendi.\n📝 Sebep: ${sebep}`)] });
                }
            }

            if (interaction.commandName === 'karaliste') {
                if (!yoneticiMi) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                const alt = interaction.options.getSubcommand();
                if (alt === 'liste') {
                    const metin = (ayar.karaListe || []).slice(0, 20).map((k, i) => `**${i + 1}.** Discord: \`${k.discordId || '-'}\` | Roblox: **${k.robloxUsername || '-'}** — ${k.sebep}`).join('\n') || 'Kara liste boş.';
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#dc2626').setTitle('⛔ Ortak Kara Liste').setDescription(metin)], ephemeral: true });
                }
                if (alt === 'ekle') {
                    await interaction.deferReply();
                    const dUser = interaction.options.getUser('discord_uye');
                    const rAdi = interaction.options.getString('roblox_adi');
                    const sebep = interaction.options.getString('sebep');
                    let rUser = null;
                    if (rAdi) rUser = await robloxKullaniciBul(rAdi).catch(() => null);
                    ayar.karaListe.unshift({
                        id: crypto.randomUUID(),
                        discordId: dUser?.id || '',
                        robloxId: rUser?.id || '',
                        robloxUsername: rUser?.username || rAdi || '',
                        sebep,
                        yetkili: interaction.user.tag,
                        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
                    });
                    logEkle(interaction.guildId, 'MODERASYON', 'Kara Listeye Eklendi', `${dUser?.tag || ''} ${rUser?.username || ''} — ${sebep}`, interaction.user.tag);
                    return interaction.editReply(`⛔ Kayıt ortak kara listeye eklendi! Sebep: **${sebep}**`);
                }
            }

            if (interaction.commandName === 'çekiliş') {
                if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageEvents)) {
                    return interaction.reply({ content: '❌ Çekiliş yönetme yetkiniz yok.', ephemeral: true });
                }
                const alt = interaction.options.getSubcommand();
                if (alt === 'baslat') {
                    const odul = interaction.options.getString('odul');
                    const sureDk = interaction.options.getInteger('sure_dakika');
                    const kazananSayisi = interaction.options.getInteger('kazanan_sayisi') || 1;
                    const sartRol = interaction.options.getRole('sart_rol');
                    const sartSeviye = interaction.options.getInteger('sart_seviye') || 0;
                    const bitisTimestamp = Date.now() + sureDk * 60 * 1000;
                    const id = crypto.randomUUID().slice(0, 8);

                    const sartlar = [];
                    if (sartRol) sartlar.push(`• Gerekli Rol: <@&${sartRol.id}>`);
                    if (sartSeviye > 0) sartlar.push(`• Minimum Seviye: **Seviye ${sartSeviye}**`);

                    const embed = new EmbedBuilder()
                        .setColor('#f59e0b')
                        .setTitle(`🎉 ÇEKİLİŞ: ${odul}`)
                        .setDescription(`Katılmak için aşağıdaki butona tıklayın!\n\n⏰ **Bitiş:** <t:${Math.floor(bitisTimestamp / 1000)}:R>\n🏆 **Kazanan Sayısı:** ${kazananSayisi}\n👥 **Katılımcı:** 0 kişi\n${sartlar.length ? '\n**Katılım Şartları:**\n' + sartlar.join('\n') : ''}`)
                        .setFooter({ text: `Çekiliş ID: ${id} • Başlatan: ${interaction.user.tag}` })
                        .setTimestamp(bitisTimestamp);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`cekilis_katil_${id}`).setLabel('🎉 Çekilişe Katıl (0)').setStyle(ButtonStyle.Success)
                    );

                    const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
                    ayar.cekilisler.unshift({
                        id, kanalId: interaction.channelId, mesajId: msg.id, odul, kazananSayisi,
                        bitisTimestamp, olusturan: interaction.user.tag, bitti: false,
                        katilanlar: [], kazananlar: [], sartRolId: sartRol?.id || '', sartMinSeviye: sartSeviye, sartMinNobetDk: 0
                    });
                    logEkle(interaction.guildId, 'CEKILIS', 'Çekiliş Başlatıldı', `${odul} (${sureDk} dk)`, interaction.user.tag);
                    return interaction.reply({ content: `✅ Çekiliş başlatıldı! ID: \`${id}\``, ephemeral: true });
                }
                if (alt === 'bitir' || alt === 'yeniden-cek') {
                    const id = interaction.options.getString('id');
                    const c = (ayar.cekilisler || []).find(x => x.id === id);
                    if (!c) return interaction.reply({ content: '❌ Çekiliş ID bulunamadı.', ephemeral: true });
                    await cekilisSonlandir(interaction.guild, ayar, c, alt === 'yeniden-cek');
                    return interaction.reply({ content: '✅ İşlem tamamlandı.', ephemeral: true });
                }
            }

            if (interaction.commandName === 'anons') {
                if (!yoneticiMi) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });
                const kanal = interaction.options.getChannel('kanal');
                const mesaj = interaction.options.getString('mesaj');
                await sesKanalinaAnonsYap(interaction.guild, kanal.id, mesaj);
                logEkle(interaction.guildId, 'SES', 'Canlı TTS Anons Yapıldı', `#${kanal.name}: ${mesaj.slice(0, 60)}`, interaction.user.tag);
                return interaction.editReply(`📢 **#${kanal.name}** kanalında anons okunuyor!`);
            }

            if (interaction.commandName === 'kimlik') {
                const hedef = interaction.options.getUser('uye') || interaction.user;
                const uye = await interaction.guild.members.fetch(hedef.id).catch(() => null);
                const analiz = uyeRutbeVeKimlikAnaliz(interaction.guild, uye, ayar);
                const embed = new EmbedBuilder()
                    .setColor(ayar.tema.accent || '#10b981')
                    .setTitle('🪪 TSF Personel Sicil & Kimlik Kartı')
                    .setThumbnail(hedef.displayAvatarURL({ size: 256 }))
                    .addFields(
                        { name: '👤 Personel', value: `${hedef} (\`${hedef.tag}\`)`, inline: true },
                        { name: '🎖️ En Yüksek Rütbe', value: `**${analiz?.enYuksekRutbe || 'Bilinmiyor'}**`, inline: true },
                        { name: '🎮 Roblox Hesabı', value: analiz?.robloxUsername ? `**${analiz.robloxUsername}** ✅` : 'Doğrulanmamış (`/verify`)', inline: true },
                        { name: '🏆 Seviye & XP', value: `Seviye **${analiz?.seviye || 1}** (${analiz?.xp || 0} XP)`, inline: true },
                        { name: '⏱️ Haftalık Nöbet', value: `**${analiz?.nobetDakika || 0} dk**`, inline: true },
                        { name: '⚠️ Uyarı', value: `${analiz?.uyariSayisi || 0} Kayıt`, inline: true },
                        { name: '🏅 Madalya & Bröveler', value: analiz?.madalyalar?.length ? analiz.madalyalar.slice(0, 5).map(m => `🏅 ${m.ad}`).join('\n') : 'Yok', inline: true },
                        { name: '⚖️ Disiplin Sicili', value: analiz?.disiplin?.length ? analiz.disiplin.slice(0, 5).map(d => `• [${d.tur}] ${d.sebep}`).join('\n') : 'Temiz', inline: true },
                        { name: '🎭 Roller', value: analiz?.roller?.slice(0, 12).join(', ') || 'Rol yok' }
                    );
                return interaction.reply({ embeds: [embed] });
            }

            if (interaction.commandName === 'moderasyon') {
                const alt = interaction.options.getSubcommand();
                if (alt === 'uyarilar') {
                    const hedef = interaction.options.getUser('uye');
                    const liste = (ayar.uyarilar || []).filter(u => u.kullaniciId === hedef.id);
                    return interaction.reply({
                        embeds: [new EmbedBuilder().setColor('#f59e0b').setTitle(`📋 Sicil Uyarı Kayıtları — ${hedef.tag}`)
                            .setDescription(liste.length ? liste.slice(0, 15).map((u, idx) => `**${idx + 1}.** \`${u.tarih}\` — **${u.sebep}** *(${u.yetkili})*`).join('\n') : 'Uyarı kaydı yok.')],
                        ephemeral: true
                    });
                }
                if (alt === 'uyar') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id);
                    const sebep = interaction.options.getString('sebep');
                    const res = await uyariEkleVeMerdivenUygula(interaction.guild, member, ayar, interaction.user.tag, sebep);
                    logEkle(interaction.guildId, 'MODERASYON', 'Resmi Uyarı', `${hedef.tag}: ${sebep} (${res.toplam}. uyarı → ${res.uygulananCeza})`, interaction.user.tag);
                    const embed = new EmbedBuilder().setColor('#f59e0b').setTitle('⚠️ Resmi Disiplin Uyarısı')
                        .setDescription(`**Personel:** ${hedef}\n**Sebep:** ${sebep}\n**Toplam Uyarı:** ${res.toplam}\n**Uygulanan Aksiyon:** ${res.uygulananCeza}`).setTimestamp();
                    await modLogEmbedGonder(interaction.guild, ayar, embed);
                    return interaction.reply({ embeds: [embed] });
                }
                if (alt === 'sustur') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id);
                    const dakika = interaction.options.getInteger('dakika');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı';
                    await member.timeout(dakika * 60 * 1000, sebep);
                    logEkle(interaction.guildId, 'MODERASYON', `Susturma (${dakika} dk)`, `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    return interaction.reply(`🔇 **${hedef.tag}** ${dakika} dakika susturuldu. Sebep: ${sebep}`);
                }
                if (alt === 'at') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id);
                    const sebep = interaction.options.getString('sebep') || 'Disiplin kararı';
                    await member.kick(sebep);
                    logEkle(interaction.guildId, 'MODERASYON', 'Kick', `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    return interaction.reply(`👢 **${hedef.tag}** sunucudan atıldı.`);
                }
                if (alt === 'yasakla') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const hedef = interaction.options.getUser('uye');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı';
                    await interaction.guild.members.ban(hedef.id, { reason: sebep });
                    logEkle(interaction.guildId, 'MODERASYON', 'Ban', `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    return interaction.reply(`🔨 **${hedef.tag}** yasaklandı.`);
                }
                if (alt === 'temizle') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const silinen = await interaction.channel.bulkDelete(interaction.options.getInteger('adet'), true);
                    return interaction.reply({ content: `🧹 **${silinen.size}** mesaj silindi.`, ephemeral: true });
                }
                if (alt === 'kilit') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
                    const durum = interaction.options.getBoolean('durum');
                    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: durum ? false : null });
                    return interaction.reply(durum ? '🔒 Kanal kilitlendi.' : '🔓 Kanal kilidi açıldı.');
                }
            }

            if (interaction.commandName === 'ses-odasi') {
                if (!ayar.moduller.sesOdasi) return interaction.reply({ content: '❌ Kapalı.', ephemeral: true });
                const isim = interaction.options.getString('isim');
                const limit = interaction.options.getInteger('limit') || 0;
                const ozel = interaction.options.getBoolean('ozel') || false;
                const izinliUye = interaction.options.getUser('izinli_uye');
                const izinliRol = interaction.options.getRole('izinli_rol');

                const permissionOverwrites = [];
                if (ozel) {
                    permissionOverwrites.push({ id: interaction.guild.id, deny: [PermissionsBitField.Flags.Connect] });
                    permissionOverwrites.push({ id: interaction.user.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] });
                    if (izinliUye) permissionOverwrites.push({ id: izinliUye.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
                    if (izinliRol) permissionOverwrites.push({ id: izinliRol.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
                }

                const oda = await interaction.guild.channels.create({
                    name: `${ozel ? '🔒' : '🔊'} ${isim}`,
                    type: ChannelType.GuildVoice,
                    parent: ayar.ozelSesKategori || null,
                    userLimit: limit,
                    permissionOverwrites
                });
                ayar.ozelSesOdalari[oda.id] = { sahipId: interaction.user.id, otomatikSil: true, olusturma: Date.now() };
                logEkle(interaction.guildId, 'SES', 'Ses Odası Oluşturuldu', oda.name, interaction.user.tag);
                return interaction.reply({ content: `✅ Oda oluşturuldu: <#${oda.id}>`, ephemeral: true });
            }

            if (interaction.commandName === 'izin') {
                const gun = interaction.options.getInteger('gun');
                const sebep = interaction.options.getString('sebep');
                ayar.loaTalepleri.unshift({
                    id: crypto.randomUUID(), userId: interaction.user.id, username: interaction.user.tag,
                    gun, sebep, durum: 'beklemede', tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }), bitisTimestamp: null, yetkili: ''
                });
                logEkle(interaction.guildId, 'LOA', 'İzin Talebi', `${gun} gün — ${sebep}`, interaction.user.tag);
                return interaction.reply({ content: `✅ **${gun} günlük** izin talebiniz komuta merkezine iletildi.`, ephemeral: true });
            }

            if (interaction.commandName === 'rütbe') {
                await interaction.deferReply();
                const alt = interaction.options.getSubcommand();
                const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;

                if (alt === 'liste') {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor('#f59e0b').setTitle('🎖️ Güncel TSF Rütbe Hiyerarşisi').setDescription(tamRutbeListesiMetni(ayar).slice(0, 4000))]
                    });
                }
                if (alt === 'sorgula') {
                    const rUser = await robloxKullaniciBul(interaction.options.getString('kullanici'));
                    const bilgi = await robloxKullaniciGrupBilgisi(groupId, rUser.id);
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor('#3b82f6').setTitle(`🔍 TSF Personel Sorgu — ${rUser.username}`).setThumbnail(rUser.avatarUrl)
                            .addFields({ name: 'Roblox ID', value: `\`${rUser.id}\``, inline: true }, { name: 'Rütbe', value: bilgi ? `**${bilgi.roleName}** (Rank ${bilgi.rank})` : '❌ Üye Değil', inline: true })]
                    });
                }

                const yetkiliRolVarMi = ayar.rutbeYetkiliRol && interaction.member.roles.cache.has(ayar.rutbeYetkiliRol);
                if (!yoneticiMi && !yetkiliRolVarMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                    return interaction.editReply('❌ Rütbe verme yetkiniz yok.');
                }

                if (alt === 'ver') {
                    const kAdi = interaction.options.getString('kullanici');
                    const hedefRolId = interaction.options.getString('rutbe');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı ile terfi';

                    const sonuc = await tamRutbeIslemiYap({
                        guild: interaction.guild,
                        robloxKullaniciAdi: kAdi,
                        hedefRolId,
                        yetkiliMember: interaction.member,
                        yetkiliUserId: interaction.user.id,
                        yetkiliEtiket: interaction.user.tag
                    });

                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#10b981')
                            .setTitle('🎖️ TSF Roblox Rütbe Ataması Başarılı')
                            .setThumbnail(sonuc.robloxUser.avatarUrl)
                            .addFields(
                                { name: '👤 Personel (Roblox)', value: `**${sonuc.robloxUser.username}**`, inline: true },
                                { name: '👮 Komutan', value: `${interaction.user}`, inline: true },
                                { name: '📉 Eski → 📈 Yeni', value: `\`${sonuc.eskiRolAdi}\` → **${sonuc.yeniRol.name}**` },
                                { name: '🔗 Verify & Discord Durumu', value: sonuc.bagliDiscord ? ('✅ Doğrulanmış Hesap: <@' + sonuc.bagliDiscord.discordId + '> — Personel `/update` yazarak yeni rolünü alabilir.') : '⚠️ **UYARI:** Bu oyuncu henüz `/verify` ile Discord hesabını bağlamamış! Discord rolünü alabilmesi için önce `/verify` yapıp ardından `/update` kullanması gerekir.' },
                                { name: '📝 Sebep', value: sebep }
                            )]
                    });
                }
            }
        }

        // 3. TICKET AÇILIR MENÜSÜ (.PNG DESTEKLİ)
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_kategori_sec') {
            const ayar = sunucuAyarGetir(interaction.guildId);
            if (!ayar.moduller.ticket) return interaction.reply({ content: '❌ Ticket sistemi kapalı.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });

            const secilenId = interaction.values[0];
            const konuObj = (ayar.ticketKonular || []).find(k => k.id === secilenId) || { isim: 'Destek Talebi', emoji: '🎫', gorselUrl: '' };
            const kanalAdi = `bilet-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString().slice(-4)}`;

            const izinler = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ManageChannels] }
            ];
            if (ayar.ticketYetkiliRol) {
                izinler.push({ id: ayar.ticketYetkiliRol, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ReadMessageHistory] });
            }

            const biletKanal = await interaction.guild.channels.create({
                name: kanalAdi,
                type: ChannelType.GuildText,
                parent: ayar.ticketKategori || null,
                topic: `Sahip: ${interaction.user.tag} (${interaction.user.id}) | Konu: ${konuObj.isim}`,
                permissionOverwrites: izinler
            });

            ayar.acikBiletler[biletKanal.id] = {
                id: crypto.randomUUID(), kanalId: biletKanal.id, kanalAdi: biletKanal.name,
                sahipId: interaction.user.id, sahipTag: interaction.user.tag, konu: konuObj.isim,
                ustlenenId: '', ustlenenTag: 'Atanmadı',
                acilisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            };
            dbKaydet();

            const acilisBaslik = (ayar.ticketAcilisBaslik || '{emoji} {kategori} — Destek Talebi')
                .replace('{emoji}', konuObj.emoji || '🎫')
                .replace('{kategori}', konuObj.isim)
                .replace('{uye}', interaction.user.username);
            const acilisMetin = (ayar.ticketAcilisMesaj || 'Merhaba {uye}, destek talebiniz oluşturuldu.\n\n• **Kategori:** {kategori}\n• **Açıklama:** {aciklama}')
                .replace('{uye}', String(interaction.user))
                .replace('{kategori}', konuObj.isim)
                .replace('{aciklama}', konuObj.karsilamaNotu || konuObj.aciklama || 'Talebinizi yazıp dilerseniz .png/.jpg ekran görüntüsü ekleyebilirsiniz.');

            const embed = new EmbedBuilder()
                .setColor(ayar.ticketPanelRenk || '#3b82f6')
                .setTitle(acilisBaslik)
                .setDescription(acilisMetin)
                .setFooter({ text: ayar.ticketPanelFooter || 'ORDU YÖNETİMİ • Destek Sistemi' })
                .setTimestamp();

            const files = gorselEmbedVeEkHazirla(embed, konuObj.gorselUrl || ayar.ticketPanelGorselUrl);
            const butonlar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_ustlen').setLabel('🙋 Talebi Üstlen').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_ai_ozet').setLabel('🤖 AI Özet').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_kapat').setLabel('🔒 Bileti Kapat & Değerlendir').setStyle(ButtonStyle.Danger)
            );

            const etiket = ayar.ticketYetkiliRol ? `${interaction.user} | <@&${ayar.ticketYetkiliRol}>` : `${interaction.user}`;
            const acilisMsg = await biletKanal.send({ content: etiket, embeds: [embed], components: [butonlar], files });
            ayar.acikBiletler[biletKanal.id].mesajlar = [{
                msgId: acilisMsg.id,
                yazar: client.user.tag,
                icerik: '[Bilet Açıldı — ' + konuObj.isim + '] ' + acilisMetin,
                ekler: Array.from(acilisMsg.attachments.values()).map(a => a.url),
                zaman: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            }];
            dbKaydet(true);
            logEkle(interaction.guildId, 'TICKET', 'Bilet Açıldı', `#${biletKanal.name} (${konuObj.isim})`, interaction.user.tag);
            return interaction.editReply(`✅ Destek biletiniz açıldı: ${biletKanal}`);
        }

        // 4. BUTONLAR
        if (interaction.isButton()) {
            const cid = interaction.customId;

            if (cid === 'verify_kod_onayla_btn') {
                await interaction.deferReply({ ephemeral: true });
                const ayar = sunucuAyarGetir(interaction.guildId);
                const bekleyen = db.pendingVerifications?.[interaction.user.id] || ayar.bekleyenDogrulamalar?.[interaction.user.id];
                if (!bekleyen) return interaction.editReply('❌ Aktif doğrulama kodunuz yok. Önce `/verify kod-al <roblox_adi>` kullanın.');
                const detay = await robloxKullaniciDetayGetir(bekleyen.robloxId);
                if (!String(detay.description || '').includes(bekleyen.kod)) {
                    return interaction.editReply('❌ Profil açıklamanızda `' + bekleyen.kod + '` kodu bulunamadı! Kaydedip tekrar deneyin.');
                }
                const kara = (ayar.karaListe || []).find(k => k.robloxId === bekleyen.robloxId || k.discordId === interaction.user.id);
                if (kara) return interaction.editReply('⛔ Bu hesap kara listededir! Sebep: **' + kara.sebep + '**');
                verifyKaydet(interaction.user.id, bekleyen.robloxId, bekleyen.robloxUsername, 'Profil Kodu', interaction.guildId);
                delete db.pendingVerifications[interaction.user.id];
                delete ayar.bekleyenDogrulamalar[interaction.user.id];
                logEkle(interaction.guildId, 'RUTBE', 'Roblox Verify (Profil Kodu)', interaction.user.tag + ' ↔ ' + bekleyen.robloxUsername, interaction.user.tag);
                return interaction.editReply('✅ Hesabınız **' + bekleyen.robloxUsername + '** olarak doğrulandı! Şimdi `/update` yazarak rollerinizi alabilirsiniz.');
            }

            if (cid.startsWith('sesctrl_')) {
                const [, aksiyon, odaId] = cid.split('_');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const odaBilgi = ayar.ozelSesOdalari?.[odaId];
                const kanal = interaction.guild.channels.cache.get(odaId);
                if (!kanal) return interaction.reply({ content: '❌ Ses odası artık mevcut değil.', ephemeral: true });
                if (odaBilgi && odaBilgi.sahipId !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                    return interaction.reply({ content: '❌ Bu odayı yalnızca oda sahibi yönetebilir.', ephemeral: true });
                }
                if (aksiyon === 'kilitle') { await kanal.permissionOverwrites.edit(interaction.guild.id, { Connect: false }); return interaction.reply({ content: '🔒 Oda kilitlendi.', ephemeral: true }); }
                if (aksiyon === 'ac') { await kanal.permissionOverwrites.edit(interaction.guild.id, { Connect: true }); return interaction.reply({ content: '🔓 Oda herkese açıldı.', ephemeral: true }); }
                if (aksiyon === 'sil') { delete ayar.ozelSesOdalari[odaId]; dbKaydet(); await kanal.delete('Oda sahibi kapattı').catch(() => {}); return; }
            }

            // SINAV CEVAP BUTONU
            if (cid.startsWith('sinav_cevap_')) {
                const secilen = Number(cid.split('_')[2]);
                const key = `${interaction.guildId}_${interaction.user.id}`;
                const oturum = aktifSinavlar.get(key);
                if (!oturum) return interaction.reply({ content: '❌ Aktif sınav oturumunuz bulunamadı.', ephemeral: true });

                if (oturum.sorular[oturum.index].dogru === secilen) oturum.dogruSayisi += 1;
                oturum.index += 1;

                if (oturum.index < oturum.sorular.length) {
                    return interaction.update(sinavSoruMesajiOlustur(oturum));
                }

                aktifSinavlar.delete(key);
                const ayar = sunucuAyarGetir(interaction.guildId);
                const yuzde = Math.round((oturum.dogruSayisi / oturum.sorular.length) * 100);
                const baraj = Number(ayar.sinavAyar?.gecmeYuzdesi) || 80;
                const gecti = yuzde >= baraj;

                let terfiNot = '';
                if (gecti) {
                    const dogr = ayar.dogrulamalar?.[interaction.user.id];
                    if (dogr?.robloxUsername) {
                        try {
                            const hedefAd = ayar.sinavAyar?.terfiHedefRutbe || '[Or-2] Onbaşı';
                            await tamRutbeIslemiYap({
                                guild: interaction.guild,
                                robloxKullaniciAdi: dogr.robloxUsername,
                                hedefRolId: hedefAd,
                                yetkiliMember: null,
                                yetkiliUserId: SUPER_ADMIN_ID,
                                yetkiliEtiket: 'Otomatik Sınav Sistemi'
                            });
                            terfiNot = `\n🎖️ Tebrikler! Roblox grubunda **${hedefAd}** rütbesine terfi ettiniz! Discord rolünüzü almak için \`/update\` yazın.`;
                        } catch (e) {
                            terfiNot = `\nℹ️ Sınavı geçtiniz ancak otomatik Roblox terfisi yapılamadı: ${e.message}`;
                        }
                    } else {
                        terfiNot = '\nℹ️ Otomatik terfi için önce `/verify` komutuyla Roblox hesabınızı bağlayın.';
                    }
                }

                return interaction.update({
                    embeds: [new EmbedBuilder()
                        .setColor(gecti ? '#10b981' : '#ef4444')
                        .setTitle(gecti ? '✅ SINAVI BAŞARIYLA GEÇTİNİZ!' : '❌ SINAVDA BAŞARISIZ OLDUNUZ')
                        .setDescription(`**Doğru:** ${oturum.dogruSayisi} / ${oturum.sorular.length} (**%${yuzde}**)\n**Geçme Barajı:** %${baraj}${terfiNot}`)],
                    components: []
                });
            }

            // ÇEKİLİŞ KATILIM BUTONU
            if (cid.startsWith('cekilis_katil_')) {
                const cekId = cid.replace('cekilis_katil_', '');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const c = (ayar.cekilisler || []).find(x => x.id === cekId);
                if (!c || c.bitti) return interaction.reply({ content: '❌ Bu çekiliş sona erdi.', ephemeral: true });

                if (c.sartRolId && !interaction.member.roles.cache.has(c.sartRolId)) {
                    return interaction.reply({ content: `❌ Bu çekilişe katılmak için <@&${c.sartRolId}> rolüne sahip olmalısınız!`, ephemeral: true });
                }
                const xp = ayar.leveling?.kullanicilar?.[interaction.user.id]?.seviye || 1;
                if (c.sartMinSeviye > 0 && xp < c.sartMinSeviye) {
                    return interaction.reply({ content: `❌ Bu çekiliş için en az **Seviye ${c.sartMinSeviye}** olmalısınız! (Mevcut: ${xp})`, ephemeral: true });
                }
                const nobetDk = Math.round((ayar.nobetSureleri?.[interaction.user.id]?.toplamSaniye || 0) / 60);
                if (c.sartMinNobetDk > 0 && nobetDk < c.sartMinNobetDk) {
                    return interaction.reply({ content: `❌ Bu çekiliş için en az **${c.sartMinNobetDk} dk** ses nöbetiniz olmalı!`, ephemeral: true });
                }

                if (c.katilanlar.includes(interaction.user.id)) {
                    c.katilanlar = c.katilanlar.filter(x => x !== interaction.user.id);
                    dbKaydet();
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(cid).setLabel(`🎉 Çekilişe Katıl (${c.katilanlar.length})`).setStyle(ButtonStyle.Success));
                    await interaction.message.edit({ components: [row] }).catch(() => {});
                    return interaction.reply({ content: 'ℹ️ Çekilişten ayrıldınız.', ephemeral: true });
                }

                c.katilanlar.push(interaction.user.id);
                dbKaydet();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(cid).setLabel(`🎉 Çekilişe Katıl (${c.katilanlar.length})`).setStyle(ButtonStyle.Success));
                await interaction.message.edit({ components: [row] }).catch(() => {});
                return interaction.reply({ content: '🎉 Çekilişe başarıyla katıldınız! Bol şans!', ephemeral: true });
            }

            if (cid === 'ses_panel_acik_olustur' || cid === 'ses_panel_ozel_olustur') {
                const ayar = sunucuAyarGetir(interaction.guildId);
                if (!ayar.moduller.sesOdasi) return interaction.reply({ content: '❌ Özel ses odası sistemi kapalı.', ephemeral: true });
                const ozelMi = cid === 'ses_panel_ozel_olustur';
                const modal = new ModalBuilder()
                    .setCustomId(`sesmodal_${ozelMi ? 'ozel' : 'acik'}`)
                    .setTitle(ozelMi ? '🔒 Özel / Kilitli Ses Odası' : '🔊 Herkese Açık Ses Odası');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('oda_isim').setLabel('Ses Odası İsmi').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('oda_limit').setLabel('Kişi Limiti (0=Sınırsız, 1-99)').setValue('0').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2))
                );
                return interaction.showModal(modal);
            }

            if (cid === 'ticket_ustlen') {
                const ayar = sunucuAyarGetir(interaction.guildId);
                if (ayar.acikBiletler[interaction.channelId]) {
                    ayar.acikBiletler[interaction.channelId].ustlenenId = interaction.user.id;
                    ayar.acikBiletler[interaction.channelId].ustlenenTag = interaction.user.tag;
                    dbKaydet();
                }
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#10b981').setDescription(`🙋 Bu bilet **${interaction.user}** tarafından üstlenildi.`)] });
            }

            if (cid === 'ticket_ai_ozet') {
                await interaction.deferReply();
                const mesajlar = await interaction.channel.messages.fetch({ limit: 30 });
                const dokum = Array.from(mesajlar.values()).reverse().filter(m => m.content).map(m => `${m.author.username}: ${m.content}`).join('\n');
                const ozet = await geminiSor('Destek konuşmasını 3-4 maddede özetle.', dokum || 'Mesaj yok.');
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#8b5cf6').setTitle('🤖 AI Bilet Özeti').setDescription(ozet)] });
            }

            if (cid === 'ticket_kapat') {
                await interaction.reply('🔒 Bilet kapatılıyor, sohbet arşivleniyor ve değerlendirme gönderiliyor...');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const acikBilgi = ayar.acikBiletler[interaction.channelId] || {};
                const canli = Array.isArray(acikBilgi.mesajlar) ? [...acikBilgi.mesajlar] : [];
                const bilinen = new Set(canli.map(m => m.msgId).filter(Boolean));
                const mesajlar = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (mesajlar) {
                    for (const m of Array.from(mesajlar.values()).reverse()) {
                        if (!bilinen.has(m.id)) {
                            canli.push({
                                msgId: m.id,
                                yazar: m.author.tag,
                                icerik: m.content || (m.attachments.size ? '[Görsel / Dosya]' : '[Embed]'),
                                ekler: Array.from(m.attachments.values()).map(a => a.url),
                                zaman: new Date(m.createdTimestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
                            });
                        }
                    }
                }
                const sirali = canli;

                const ticketId = acikBilgi.id || crypto.randomUUID();
                const sahipId = acikBilgi.sahipId || (interaction.channel.topic?.match(/\((\d{17,20})\)/)?.[1] || '');
                const ustlenenTag = acikBilgi.ustlenenTag && acikBilgi.ustlenenTag !== 'Atanmadı' ? acikBilgi.ustlenenTag : interaction.user.tag;

                ayar.kapatilanBiletler.unshift({
                    id: ticketId, kanalAdi: interaction.channel.name, sahipId,
                    sahipTag: acikBilgi.sahipTag || 'Bilinmiyor', konu: acikBilgi.konu || 'Destek Talebi',
                    ustlenenId: acikBilgi.ustlenenId || interaction.user.id, ustlenenTag,
                    kapatan: interaction.user.tag, kapanisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    mesajSayisi: sirali.length, mesajlar: sirali, puan: null, yorum: ''
                });
                delete ayar.acikBiletler[interaction.channelId];
                logEkle(interaction.guildId, 'TICKET', 'Bilet Kapatıldı', `#${interaction.channel.name}`, interaction.user.tag);

                if (sahipId) {
                    const sahipUser = await client.users.fetch(sahipId).catch(() => null);
                    if (sahipUser) {
                        const rateEmbed = new EmbedBuilder().setColor('#f59e0b').setTitle('⭐ Destek Bileti Değerlendirmesi')
                            .setDescription(`**#${interaction.channel.name}** biletiniz kapatıldı.\nYetkili: **${ustlenenTag}**`);
                        const yildizRow = new ActionRowBuilder().addComponents(
                            [1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`trate_${interaction.guildId}_${ticketId}_${n}`).setLabel(`${'⭐'.repeat(n)} (${n})`).setStyle(n >= 4 ? ButtonStyle.Success : (n === 3 ? ButtonStyle.Primary : ButtonStyle.Danger)))
                        );
                        const yorumRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`tcomm_${interaction.guildId}_${ticketId}`).setLabel('📝 Yetkili Hakkında Yorum Yaz').setStyle(ButtonStyle.Secondary)
                        );
                        await sahipUser.send({ embeds: [rateEmbed], components: [yildizRow, yorumRow] }).catch(() => {});
                    }
                }
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3500);
                return;
            }

            if (cid.startsWith('trate_')) {
                const [, gId, tId, puanStr] = cid.split('_');
                const ayar = sunucuAyarGetir(gId);
                const bilet = ayar.kapatilanBiletler.find(b => b.id === tId);
                if (!bilet) return interaction.reply({ content: '❌ Bilet bulunamadı.', ephemeral: true });
                bilet.puan = Number(puanStr);
                dbKaydet();
                return interaction.reply({ content: `✅ **${bilet.puan} ★** değerlendirmeniz kaydedildi!`, ephemeral: true });
            }

            if (cid.startsWith('tcomm_')) {
                const [, gId, tId] = cid.split('_');
                const modal = new ModalBuilder().setCustomId(`tmodal_${gId}_${tId}`).setTitle('📝 Bilet Değerlendirme Yorumu');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yorum_metni').setLabel('Yorumunuz').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400)));
                return interaction.showModal(modal);
            }

            if (cid.startsWith('op_')) {
                const [, durum, opId] = cid.split('_');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const op = (ayar.operasyonlar || []).find(o => o.id === opId);
                if (!op) return interaction.reply({ content: '❌ Operasyon bulunamadı.', ephemeral: true });
                const etiket = `<@${interaction.user.id}>`;
                op.katilanlar = (op.katilanlar || []).filter(x => x !== etiket);
                op.mazeretliler = (op.mazeretliler || []).filter(x => x !== etiket);
                op.belki = (op.belki || []).filter(x => x !== etiket);
                if (durum === 'katil') op.katilanlar.push(etiket);
                else if (durum === 'mazeret') op.mazeretliler.push(etiket);
                else if (durum === 'belki') op.belki.push(etiket);
                dbKaydet();
                const embed = EmbedBuilder.from(interaction.message.embeds[0]).setFields(
                    { name: '📅 Tarih & Saat', value: op.tarihSaat, inline: true },
                    { name: `✅ Katılacaklar (${op.katilanlar.length})`, value: op.katilanlar.join(', ') || 'Henüz yok' },
                    { name: `❌ Mazeretliler (${op.mazeretliler.length})`, value: op.mazeretliler.join(', ') || 'Henüz yok' },
                    { name: `🕒 Belki (${op.belki.length})`, value: op.belki.join(', ') || 'Henüz yok' }
                );
                await interaction.message.edit({ embeds: [embed] });
                return interaction.reply({ content: '🫡 Katılım durumunuz güncellendi!', ephemeral: true });
            }

            if (cid === 'tsf_yoklama_katil') {
                const oldEmbed = interaction.message.embeds[0];
                if (!oldEmbed) return;
                const mevcut = oldEmbed.fields?.[0]?.value || '';
                const etiket = `<@${interaction.user.id}>`;
                if (mevcut.includes(etiket)) return interaction.reply({ content: '✅ Zaten yoklamadasınız.', ephemeral: true });
                const yeni = mevcut === 'Henüz katılım yok.' ? `• ${etiket}` : `${mevcut}\n• ${etiket}`;
                await interaction.message.edit({ embeds: [EmbedBuilder.from(oldEmbed).setFields({ name: `📋 Hazır Bulunan Personel (${yeni.split('\n').length} Kişi)`, value: yeni.slice(0, 1020) })] });
                return interaction.reply({ content: '🫡 Tekmiliniz alındı!', ephemeral: true });
            }
        }

        // 5. MODALLAR
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('sesmodal_')) {
                const ozelMi = interaction.customId === 'sesmodal_ozel';
                const ayar = sunucuAyarGetir(interaction.guildId);
                const odaIsmi = interaction.fields.getTextInputValue('oda_isim').trim();
                const limit = Math.min(99, Math.max(0, parseInt(interaction.fields.getTextInputValue('oda_limit'), 10) || 0));
                const permissionOverwrites = [];
                if (ozelMi) {
                    permissionOverwrites.push({ id: interaction.guild.id, deny: [PermissionsBitField.Flags.Connect] });
                    permissionOverwrites.push({ id: interaction.user.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] });
                }
                const oda = await interaction.guild.channels.create({
                    name: `${ozelMi ? '🔒' : '🔊'} ${odaIsmi}`,
                    type: ChannelType.GuildVoice,
                    parent: ayar.ozelSesKategori || null,
                    userLimit: limit,
                    permissionOverwrites
                });
                ayar.ozelSesOdalari[oda.id] = { sahipId: interaction.user.id, otomatikSil: true, olusturma: Date.now() };
                logEkle(interaction.guildId, 'SES', 'Özel Oda Açıldı', oda.name, interaction.user.tag);
                return interaction.reply({ content: `✅ **${oda.name}** oluşturuldu: <#${oda.id}>`, ephemeral: true });
            }

            if (interaction.customId.startsWith('tmodal_')) {
                const [, gId, tId] = interaction.customId.split('_');
                const ayar = sunucuAyarGetir(gId);
                const bilet = ayar.kapatilanBiletler.find(b => b.id === tId);
                if (bilet) {
                    bilet.yorum = interaction.fields.getTextInputValue('yorum_metni').trim();
                    dbKaydet();
                }
                return interaction.reply({ content: '✅ Yorumunuz kaydedildi!', ephemeral: true });
            }
        }
    } catch (err) {
        console.error('Interaction Hatası:', err);
        const msg = `❌ Hata: ${err.message}`;
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg }).catch(() => {});
        else if (interaction.isRepliable()) await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
});

// ============================================================================
// 10. MESAJ OLAYLARI: AI MODERASYON, AUTOMOD, GELİŞMİŞ AI & ÖZEL KOMUTLAR (!XXXXX)
// ============================================================================
const spamTakip = new Map();
const sonMesajTakip = new Map();
const xpCooldown = new Map();

async function automodCezaUygula(message, ayar, sebep, kaynak = 'AutoMod') {
    await message.delete().catch(() => {});
    const aksiyon = ayar.automod.cezaAksiyonu || 'uyari_merdiveni';

    if (aksiyon === 'uyari_merdiveni' || aksiyon === 'sil_uyar') {
        const res = await uyariEkleVeMerdivenUygula(message.guild, message.member, ayar, kaynak, sebep);
        const uyariMsg = await message.channel.send(`🛡️ ${message.author}, **${sebep}** nedeniyle uyarıldınız! (Toplam Uyarı: **${res.toplam}** | İşlem: **${res.uygulananCeza}**)`);
        setTimeout(() => uyariMsg.delete().catch(() => {}), 5500);
        logEkle(message.guild.id, 'AUTOMOD', `${kaynak}: ${res.uygulananCeza}`, `${message.author.tag} — ${sebep}`, kaynak);
    } else if (aksiyon === 'sil_timeout') {
        const dk = Number(ayar.automod.timeoutDakika) || 5;
        await message.member?.timeout(dk * 60 * 1000, `${kaynak}: ${sebep}`).catch(() => {});
        const uyariMsg = await message.channel.send(`🔇 ${message.author}, **${sebep}** nedeniyle **${dk} dakika** susturuldunuz.`);
        setTimeout(() => uyariMsg.delete().catch(() => {}), 5500);
        logEkle(message.guild.id, 'AUTOMOD', `${kaynak} Susturma (${dk} dk)`, `${message.author.tag} — ${sebep}`, kaynak);
    } else {
        const uyariMsg = await message.channel.send(`🛡️ ${message.author}, **${sebep}** nedeniyle mesajınız silindi.`);
        setTimeout(() => uyariMsg.delete().catch(() => {}), 4500);
        logEkle(message.guild.id, 'AUTOMOD', 'Mesaj Silindi', `${message.author.tag} — ${sebep}`, kaynak);
    }
}

function ticketMesajKaydet(message) {
    try {
        if (!message.guild) return;
        const ayar = sunucuAyarGetir(message.guild.id);
        const isTicket = Boolean(ayar.acikBiletler?.[message.channel.id]) || message.channel.name.startsWith('bilet-');
        if (!isTicket) return;
        if (!ayar.acikBiletler[message.channel.id]) {
            ayar.acikBiletler[message.channel.id] = {
                id: crypto.randomUUID(), kanalId: message.channel.id, kanalAdi: message.channel.name,
                sahipId: message.channel.topic?.match(/\((\d{17,20})\)/)?.[1] || '', sahipTag: 'Bilinmiyor',
                konu: message.channel.topic || 'Destek Talebi', ustlenenId: '', ustlenenTag: 'Atanmadı',
                acilisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }), mesajlar: []
            };
        }
        const bilet = ayar.acikBiletler[message.channel.id];
        if (!Array.isArray(bilet.mesajlar)) bilet.mesajlar = [];
        if (bilet.mesajlar.some(m => m.msgId === message.id)) return;
        const ekler = Array.from(message.attachments.values()).map(a => a.url);
        const embedOzet = message.embeds?.length ? message.embeds.map(e => [e.title, e.description].filter(Boolean).join(' — ')).join(' | ') : '';
        bilet.mesajlar.push({
            msgId: message.id,
            yazar: message.author?.tag || 'Bilinmiyor',
            icerik: message.content || embedOzet || (ekler.length ? '[Görsel / Dosya Eki]' : '[Mesaj]'),
            ekler,
            zaman: new Date(message.createdTimestamp || Date.now()).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
        dbKaydet();
    } catch (_) {}
}

client.on('messageUpdate', (_oldMsg, newMsg) => {
    try {
        if (!newMsg.guild || !newMsg.content) return;
        const bilet = sunucuAyarGetir(newMsg.guild.id).acikBiletler?.[newMsg.channel.id];
        const kayit = bilet?.mesajlar?.find(m => m.msgId === newMsg.id);
        if (kayit) { kayit.icerik = newMsg.content + ' *(düzenlendi)*'; dbKaydet(); }
    } catch (_) {}
});

client.on('messageDelete', (message) => {
    try {
        if (!message.guild) return;
        const bilet = sunucuAyarGetir(message.guild.id).acikBiletler?.[message.channel.id];
        const kayit = bilet?.mesajlar?.find(m => m.msgId === message.id);
        if (kayit) { kayit.icerik = kayit.icerik + ' *(kanaldan silindi)*'; dbKaydet(); }
    } catch (_) {}
});

client.on('channelDelete', (channel) => {
    try {
        if (!channel.guild) return;
        const ayar = sunucuAyarGetir(channel.guild.id);
        const acik = ayar.acikBiletler?.[channel.id];
        if (acik) {
            ayar.kapatilanBiletler.unshift({
                id: acik.id || crypto.randomUUID(), kanalAdi: acik.kanalAdi || channel.name,
                sahipId: acik.sahipId || '', sahipTag: acik.sahipTag || 'Bilinmiyor', konu: acik.konu || 'Destek Talebi',
                ustlenenId: acik.ustlenenId || '', ustlenenTag: acik.ustlenenTag || 'Manuel Kapatıldı', kapatan: 'Kanal Silindi',
                kapanisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                mesajSayisi: (acik.mesajlar || []).length, mesajlar: acik.mesajlar || [], puan: null, yorum: ''
            });
            delete ayar.acikBiletler[channel.id];
            dbKaydet(true);
        }
    } catch (_) {}
});

client.on('messageCreate', async (message) => {
    try {
        if (!message.guild) return;
        ticketMesajKaydet(message);
        if (message.author.bot) return;
        const ayar = sunucuAyarGetir(message.guild.id);
        const member = message.member;
        const superMi = message.author.id === SUPER_ADMIN_ID;
        const yoneticiMi = superMi || member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // --- A. AUTOMOD & AI MODERASYON ---
        const muafMi = yoneticiMi || (ayar.automod?.muafRol && member?.roles.cache.has(ayar.automod.muafRol));
        if (ayar.moduller.automod && !muafMi) {
            if (ayar.automod.spamEngel) {
                const simdi = Date.now();
                const gecmis = (spamTakip.get(message.author.id) || []).filter(t => simdi - t < 4500);
                gecmis.push(simdi);
                spamTakip.set(message.author.id, gecmis);
                if (gecmis.length >= 5) return automodCezaUygula(message, ayar, 'Hızlı Mesaj Flood / Spam');
            }
            if (ayar.automod.tekrarMesajEngel && message.content.length >= 6) {
                const onceki = sonMesajTakip.get(message.author.id);
                sonMesajTakip.set(message.author.id, { icerik: message.content.toLowerCase(), zaman: Date.now() });
                if (onceki && onceki.icerik === message.content.toLowerCase() && Date.now() - onceki.zaman < 10000) {
                    return automodCezaUygula(message, ayar, 'Tekrarlanan Mesaj Spam');
                }
            }
            if (ayar.automod.kufurEngel && kufurKontrolEt(message.content, ayar.automod.yasakliKelimeler)) {
                return automodCezaUygula(message, ayar, 'Küfür / Argo Kullanımı');
            }
            if (ayar.automod.linkEngel && /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)/i.test(message.content)) {
                return automodCezaUygula(message, ayar, 'İzinsiz Bağlantı / Davet Linki');
            }
            if (ayar.automod.capsEngel && message.content.length >= 12) {
                const harfler = message.content.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g, '');
                const buyukler = harfler.replace(/[^A-ZĞÜŞİÖÇ]/g, '');
                if (harfler.length >= 10 && buyukler.length / harfler.length > 0.75) {
                    return automodCezaUygula(message, ayar, 'Aşırı Büyük Harf (CAPS)');
                }
            }
            // AI MODERASYON (Gizlenmiş küfür / hakaret / argo tespiti)
            if (ayar.moduller.aiModerasyon && ayar.automod.aiModerasyonAktif && message.content.length >= 2) {
                const sonKontrol = aiModCooldown.get(message.author.id) || 0;
                if (Date.now() - sonKontrol > 3000) {
                    aiModCooldown.set(message.author.id, Date.now());
                    const aiSebep = await aiModerasyonDenetle(message.content);
                    if (aiSebep) return automodCezaUygula(message, ayar, aiSebep, 'AI Moderasyon');
                }
            }
        }

        // --- B. SEVİYE & XP ---
        if (ayar.moduller.seviye && ayar.leveling?.aktif) {
            const sonXp = xpCooldown.get(message.author.id) || 0;
            if (Date.now() - sonXp > 15000) {
                xpCooldown.set(message.author.id, Date.now());
                const kazanilan = Math.round((Math.floor(Math.random() * 11) + 10) * (Number(ayar.leveling.xpCarpan) || 1));
                if (!ayar.leveling.kullanicilar[message.author.id]) {
                    ayar.leveling.kullanicilar[message.author.id] = { seviye: 1, xp: 0, username: message.author.username };
                }
                const uData = ayar.leveling.kullanicilar[message.author.id];
                uData.username = message.author.username;
                uData.xp += kazanilan;
                const gerekli = uData.seviye * 120;
                if (uData.xp >= gerekli) {
                    uData.xp -= gerekli;
                    uData.seviye += 1;
                    const hedefKanal = (ayar.leveling.seviyeKanal && message.guild.channels.cache.get(ayar.leveling.seviyeKanal)) || message.channel;
                    hedefKanal.send(`🎖️ Tebrikler ${message.author}! **Seviye ${uData.seviye}** oldunuz!`).catch(() => {});
                }
                dbKaydet();
            }
        }

        // --- C. TICKET AI ÖN DESTEK ---
        if (ayar.moduller.ticket && message.channel.name.startsWith('bilet-') && ayar.ticketAiAktif && !message.content.startsWith(ayar.prefix)) {
            const mesajlar = await message.channel.messages.fetch({ limit: 8 });
            const yetkiliYazmisMi = mesajlar.some(m => !m.author.bot && m.author.id !== message.author.id);
            if (!yetkiliYazmisMi && mesajlar.size <= 4) {
                await message.channel.sendTyping();
                const aiCevap = await geminiSor(ayar.aiSistemTalimati + ' Destek biletindesin, yetkili gelene kadar nazikçe yardımcı ol.', message.content);
                await message.reply({ embeds: [new EmbedBuilder().setColor('#8b5cf6').setAuthor({ name: '🤖 AI Ön Destek' }).setDescription(aiCevap)] });
            }
        }

        // --- D. GELİŞMİŞ AKILLI YAPAY ZEKA (TAM SUNUCU OKUMA, EKSİKSİZ YANIT & DOĞRU ROL ANALİZİ) ---
        if (ayar.moduller.ai && ayar.aiAktif && message.mentions.has(client.user) && !message.mentions.everyone) {
            const izinliKanallar = ayar.aiIzinliKanallar || [];
            if (izinliKanallar.length > 0 && !izinliKanallar.includes(message.channel.id)) {
                const uyari = await message.reply(`🤖 Yapay zeka yalnızca izinli kanallarda aktiftir: ${izinliKanallar.map(id => `<#${id}>`).join(', ')}`);
                setTimeout(() => uyari.delete().catch(() => {}), 6000);
                return;
            }

            const soruHam = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            const soru = soruHam || 'Merhaba, kendini ve görevlerini kısaca tanıt.';

            await message.channel.sendTyping().catch(() => {});
            const typingInterval = setInterval(() => {
                message.channel.sendTyping().catch(() => {});
            }, 7000);

            try {
                // Güncel üye ve rollerin önbellekte olduğundan emin ol
                const tazeSoranMember = await message.member.fetch().catch(() => message.member);
                const sunucuTamBaglam = await sunucuTamBaglamOlustur(message.guild, ayar);

                const baglamSayisi = Math.min(25, Math.max(1, Number(ayar.aiBaglamMesajSayisi) || 10));
                const sonMesajlar = await message.channel.messages.fetch({ limit: baglamSayisi });
                const baglamMetni = Array.from(sonMesajlar.values())
                    .reverse()
                    .map(m => `${m.member?.displayName || m.author.username}: ${m.content}`)
                    .join('\n');

                const soranBilgi = uyeRutbeVeKimlikAnaliz(message.guild, tazeSoranMember, ayar);
                const hedefBilgileri = [];
                const eklenenIds = new Set([message.author.id, client.user.id]);

                for (const [, mUser] of message.mentions.members) {
                    if (eklenenIds.has(mUser.id)) continue;
                    eklenenIds.add(mUser.id);
                    const tazeHedef = await mUser.fetch().catch(() => mUser);
                    hedefBilgileri.push(uyeRutbeVeKimlikAnaliz(message.guild, tazeHedef, ayar));
                }

                // Soruda isim, kullanıcı adı veya Roblox adı geçiyorsa üyeyi bul
                const normSoru = gorunenAdNormalize(soru);
                const soruKelimeleri = normSoru.split(/[^a-z0-9_]+/).filter(k => k.length >= 3);
                if (soruKelimeleri.length > 0 && hedefBilgileri.length < 4) {
                    for (const [, m] of message.guild.members.cache) {
                        if (eklenenIds.has(m.id) || m.user.bot) continue;
                        const dNorm = gorunenAdNormalize(m.displayName);
                        const uNorm = gorunenAdNormalize(m.user.username);
                        const rNorm = gorunenAdNormalize(ayar.dogrulamalar?.[m.id]?.robloxUsername || '');
                        const eslesti = soruKelimeleri.some(k =>
                            (dNorm && dNorm.includes(k)) ||
                            (uNorm && uNorm.includes(k)) ||
                            (rNorm && rNorm.includes(k))
                        );
                        if (eslesti) {
                            eklenenIds.add(m.id);
                            hedefBilgileri.push(uyeRutbeVeKimlikAnaliz(message.guild, m, ayar));
                            if (hedefBilgileri.length >= 4) break;
                        }
                    }
                }

                // Rütbe listesi sorulduğunda TÜM TSF rütbe listesini eksiksiz ekle
                const rutbeListesiSorulduMu = /(rütbe|rutbe|hiyerarşi|hiyerarsi|liste|sıralama|siralama)/i.test(soru);
                const tamListeBlok = rutbeListesiSorulduMu
                    ? `\n\n[RESMİ TAM TSF RÜTBE LİSTESİ — SORULURSA KISALTMADAN HEPSİNİ SIRASIYLA YAZ]:\n${tamRutbeListesiMetni(ayar)}`
                    : '';

                const kimlikBaglami = [
                    `[SORUYU SORAN KİŞİNİN TAM PROFİLİ]:`,
                    `• Görünen İsim: ${soranBilgi.displayName} (Normalize: ${gorunenAdNormalize(soranBilgi.displayName)}) | Discord Kullanıcı Adı: @${soranBilgi.tag}`,
                    `• EN YÜKSEK TSF RÜTBESİ: ${soranBilgi.enYuksekRutbe}`,
                    `• Discord Hiyerarşisindeki En Üst Rolü: ${soranBilgi.enYuksekDiscordRol}`,
                    `• Sahip Olduğu TÜM Discord Rolleri (Yukarıdan Aşağıya Sıralı): ${soranBilgi.roller.join(', ') || 'Rol yok'}`,
                    `• Bağlı Roblox Hesabı: ${soranBilgi.robloxUsername ? `${soranBilgi.robloxUsername} (ID: ${soranBilgi.robloxId})` : 'Doğrulanmamış'}`,
                    `• Seviye & XP: Seviye ${soranBilgi.seviye} (${soranBilgi.xp} XP) | Haftalık Ses Nöbeti: ${soranBilgi.nobetDakika} dk | Uyarı Sayısı: ${soranBilgi.uyariSayisi}`,
                    `• Madalyalar: ${soranBilgi.madalyalar.map(m => m.ad).join(', ') || 'Yok'} | Disiplin: ${soranBilgi.disiplin.map(d => `[${d.tur}] ${d.sebep}`).join(', ') || 'Temiz'}`,
                    ...hedefBilgileri.map(h => [
                        `\n[SORUDA ADI GEÇEN / ETİKETLENEN PERSONEL]:`,
                        `• Görünen İsim: ${h.displayName} (@${h.tag}) | EN YÜKSEK TSF RÜTBESİ: ${h.enYuksekRutbe} | En Üst Discord Rolü: ${h.enYuksekDiscordRol}`,
                        `• TÜM Rolleri: ${h.roller.join(', ') || 'Yok'} | Roblox: ${h.robloxUsername || 'Doğrulanmamış'} | Seviye: ${h.seviye} | Nöbet: ${h.nobetDakika} dk | Uyarı: ${h.uyariSayisi} | Madalyalar: ${h.madalyalar.map(m => m.ad).join(', ') || 'Yok'}`
                    ].join('\n'))
                ].join('\n');

                const sistem = `${ayar.aiSistemTalimati}
KESİN KURALLAR:
1. Yanıtını ASLA yarıda kesme; cümlelerini ve istenen bilgileri eksiksiz tamamla.
2. Kullanıcının "EN YÜKSEK TSF RÜTBESİ" ve "Sahip Olduğu TÜM Discord Rolleri" verilerine %100 sadık kal. Örneğin kişinin rolleri arasında Başkomutan varsa ona kesinlikle Başkomutan olarak hitap et ve tüm önemli rollerini/birimlerini doğru say; asla alt rütbelerini ana rütbesi sanma.
3. Sana verilen [SUNUCU GENEL BİLGİLERİ], [SUNUCU ROL HİYERARŞİSİ], [ÜST KOMUTA & YÖNETİM KADROSU] ve [SUNUCU KANALLARI] verilerini kullanarak sunucu hakkındaki her soruyu (kim hangi rolde, hangi kanallar var, kaç üye var, liderlik tabloları vb.) tam doğrulukla yanıtla.
4. Kullanıcı TSF rütbe listesini sorarsa sınıf adlarını söyleyip geçme; sana verilen RESMİ TAM TSF RÜTBE LİSTESİ'ndeki tüm rütbeleri eksiksiz ve sırasıyla yaz.`;

                const tamPrompt = `${sunucuTamBaglam}\n\n${kimlikBaglami}${tamListeBlok}\n\n[KANALDAKİ SON ${baglamSayisi} MESAJ]:\n${baglamMetni}\n\n[KULLANICI SORUSU]:\n${soru}`;
                const yanit = await geminiSor(sistem, tamPrompt, [], 4096);
                logEkle(message.guild.id, 'AI', 'AI Yanıt Üretti', `#${message.channel.name}: ${soru.slice(0, 60)}`, message.author.tag);
                return await uzunMesajGonder(message, yanit);
            } catch (aiErr) {
                console.error('AI Yanıt Hatası:', aiErr);
                return await message.reply(`⚠️ Yapay zeka yanıt oluştururken geçici bir sorun oluştu: \`${aiErr.message}\``).catch(() => {});
            } finally {
                clearInterval(typingInterval);
            }
        }

        // --- E. PREFİX KOMUTLAR & ÖZEL KOMUTLAR (!XXXXX) ---
        const prefix = ayar.prefix || '!';
        if (!message.content.startsWith(prefix)) return;
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const komut = (args.shift() || '').toLowerCase();

        // 1. PANELDE TANIMLI ÖZEL KOMUTLAR (!XXXXX)
        if (ayar.moduller.ozelKomutlar) {
            const ozel = (ayar.ozelKomutlar || []).find(k => k.tetikleyici.replace(/^!/, '').toLowerCase() === komut);
            if (ozel) {
                const components = [];
                if (ozel.url && ozel.url.startsWith('http')) {
                    components.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel(ozel.butonMetni || '🔗 Bağlantıya Git').setStyle(ButtonStyle.Link).setURL(ozel.url)
                    ));
                }
                if (ozel.embedOlsun !== false) {
                    const embed = new EmbedBuilder()
                        .setColor(ozel.renk || ayar.tema.primary || '#3b82f6')
                        .setDescription(`${ozel.cevapMetni || ''}${ozel.url ? `\n\n🔗 ${ozel.url}` : ''}`);
                    const files = gorselEmbedVeEkHazirla(embed, ozel.gorselUrl);
                    return message.reply({ embeds: [embed], components, files });
                } else {
                    return message.reply({ content: `${ozel.cevapMetni || ''} ${ozel.url || ''}`.trim(), components });
                }
            }
        }

        if (komut === 'ping') return message.reply(`🏓 Pong! **${client.ws.ping} ms**`);

        if (komut === 'verify' || komut === 'dogrula' || komut === 'doğrula') {
            const link = robloxOAuthLinkOlustur(message.author.id, message.guild.id);
            const embed = new EmbedBuilder()
                .setColor('#3b82f6')
                .setTitle('🛡️ Roblox Hesap Doğrulama (OAuth 2.0)')
                .setDescription('Aşağıdaki butona tıklayarak resmi `roblox.com` giriş ekranından hesabınızı doğrulayabilirsiniz. Giriş yaptığınızda rolleriniz otomatik güncellenir.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('🔗 Roblox ile Giriş Yap (Doğrula)').setStyle(ButtonStyle.Link).setURL(link)
            );
            return message.reply({ embeds: [embed], components: [row] });
        }

        if (komut === 'update') {
            const dogrulama = ayar.dogrulamalar?.[message.author.id];
            if (!dogrulama && !args[0] && ROBLOX_CLIENT_ID) {
                const link = robloxOAuthLinkOlustur(message.author.id, message.guild.id);
                const embed = new EmbedBuilder()
                    .setColor('#f59e0b')
                    .setTitle('⚠️ Roblox Hesabınız Henüz Bağlı Değil')
                    .setDescription('Rütbe rollerinizi güncelleyebilmem için önce resmi Roblox hesabınızla giriş yaparak doğrulama yapmanız gerekiyor:');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('🔗 Roblox ile Giriş Yap & Güncelle').setStyle(ButtonStyle.Link).setURL(link)
                );
                return message.reply({ embeds: [embed], components: [row] });
            }

            const bekle = await message.reply('⏳ Roblox rütbeniz kontrol ediliyor...');
            try {
                const sonuc = await kullaniciRolleriniGuncelle(message.guild, message.member, ayar, args[0] || null);
                const ek = sonuc.eklenenRoller.length ? sonuc.eklenenRoller.map(r => `➕ <@&${r.id}>`).join('\n') : '• Yok';
                const cik = sonuc.cikarilanRoller.length ? sonuc.cikarilanRoller.map(r => `➖ <@&${r.id}>`).join('\n') : '• Yok';
                return bekle.edit({
                    content: '',
                    embeds: [new EmbedBuilder().setColor('#10b981').setTitle('🔄 Roller Güncellendi')
                        .addFields({ name: 'Roblox Rütbesi', value: `**${sonuc.grupBilgi.roleName}**` }, { name: '🟢 Eklenen Roller', value: ek }, { name: '🔴 Çıkarılan Roller', value: cik })]
                });
            } catch (e) {
                return bekle.edit(`❌ ${e.message}`);
            }
        }

        if (komut === 'yoklama') {
            if (!yoneticiMi && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ Yetkiniz yok.');
            const baslik = args.join(' ') || 'TSF Genel Aktiflik Yoklaması';
            const embed = new EmbedBuilder().setColor('#f59e0b').setTitle(`🫡 ${baslik}`)
                .setDescription(`Komutan **${message.author}** yoklama başlattı.`)
                .addFields({ name: '📋 Hazır Bulunan Personel (0 Kişi)', value: 'Henüz katılım yok.' }).setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tsf_yoklama_katil').setLabel('🫡 Buradayım').setStyle(ButtonStyle.Success));
            return message.channel.send({ embeds: [embed], components: [row] });
        }

        if (komut === 'sil') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ Yetkiniz yok.');
            const adet = Math.min(100, Math.max(1, parseInt(args[0], 10) || 0));
            if (!adet) return message.reply(`Kullanım: \`${prefix}sil <1-100>\``);
            await message.delete().catch(() => {});
            const silinen = await message.channel.bulkDelete(adet, true);
            const info = await message.channel.send(`🧹 **${silinen.size}** mesaj silindi.`);
            setTimeout(() => info.delete().catch(() => {}), 3500);
            return;
        }

        if (komut === 'uyar') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !yoneticiMi) return message.reply('❌ Yetkiniz yok.');
            const hedef = message.mentions.members.first();
            const sebep = args.slice(1).join(' ') || 'Disiplin ihlali';
            if (!hedef) return message.reply(`Kullanım: \`${prefix}uyar @kullanıcı <sebep>\``);
            const res = await uyariEkleVeMerdivenUygula(message.guild, hedef, ayar, message.author.tag, sebep);
            logEkle(message.guild.id, 'MODERASYON', 'Resmi Uyarı', `${hedef.user.tag}: ${sebep} (${res.toplam}. uyarı)`, message.author.tag);
            return message.reply(`⚠️ **${hedef.user.tag}** uyarıldı! (Toplam: **${res.toplam}** | İşlem: **${res.uygulananCeza}**)\n📝 Sebep: ${sebep}`);
        }
    } catch (err) {
        console.error('Mesaj işleme hatası:', err.message);
    }
});

// ============================================================================
// 11. SUNUCU OLAYLARI: KARA LİSTE ALARMI, YENİ HESAP, KARŞILAMA & NÖBET
// ============================================================================
const aktifNobetBaslangic = new Map();

client.on('guildMemberAdd', async (member) => {
    try {
        const ayar = sunucuAyarGetir(member.guild.id);

        // Kara Liste & Alt Hesap İstihbaratı
        if (ayar.moduller.karaListe) {
            const kara = (ayar.karaListe || []).find(k => k.discordId === member.id);
            if (kara) {
                const alarm = new EmbedBuilder()
                    .setColor('#dc2626')
                    .setTitle('🚨 KARA LİSTE İSTİHBARAT ALARMI!')
                    .setDescription(`Kara listedeki **${member.user.tag}** (\`${member.id}\`) sunucuya katıldı!\n📝 **Sebep:** ${kara.sebep}\n👮 **Ekleyen:** ${kara.yetkili}`)
                    .setTimestamp();
                await modLogEmbedGonder(member.guild, ayar, alarm);
                if (ayar.karaListeOtoBan) {
                    await member.ban({ reason: `Ortak Kara Liste: ${kara.sebep}` }).catch(() => {});
                    logEkle(member.guild.id, 'MODERASYON', 'Kara Liste Oto-Ban', member.user.tag, 'Sistem');
                    return;
                }
            }
        }

        const minGun = Number(ayar.automod?.yeniHesapKorumaGun) || 0;
        if (ayar.moduller.automod && minGun > 0) {
            const yas = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (yas < minGun) {
                await member.kick(`Yeni hesap koruması (${Math.floor(yas)} gün)`).catch(() => {});
                logEkle(member.guild.id, 'AUTOMOD', 'Yeni Hesap Engellendi', member.user.tag, 'AutoMod');
                return;
            }
        }

        if (ayar.otoRol) {
            const rol = member.guild.roles.cache.get(ayar.otoRol);
            if (rol) await member.roles.add(rol).catch(() => {});
        }
        if (ayar.moduller.karsilama && ayar.girisCikisLogKanal) {
            const kanal = member.guild.channels.cache.get(ayar.girisCikisLogKanal);
            if (kanal) {
                const aciklama = (ayar.girisMesaj || 'Hoş geldin {uye}!').replace('{uye}', `${member}`).replace('{tag}', member.user.tag).replace('{sayi}', member.guild.memberCount);
                const embed = new EmbedBuilder().setColor(ayar.girisRenk || '#10b981').setTitle(ayar.girisBaslik || '📥 Yeni Personel Katıldı!').setDescription(aciklama).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp();
                const files = gorselEmbedVeEkHazirla(embed, ayar.girisArkaPlanUrl);
                await kanal.send({ embeds: [embed], files }).catch(() => {});
            }
        }
    } catch (_) {}
});

client.on('guildMemberRemove', async (member) => {
    try {
        const ayar = sunucuAyarGetir(member.guild.id);
        if (ayar.moduller.karsilama && ayar.girisCikisLogKanal) {
            const kanal = member.guild.channels.cache.get(ayar.girisCikisLogKanal);
            if (kanal) {
                const aciklama = (ayar.cikisMesaj || '**{tag}** ayrıldı.').replace('{tag}', member.user.tag).replace('{sayi}', member.guild.memberCount);
                const embed = new EmbedBuilder().setColor(ayar.cikisRenk || '#ef4444').setTitle(ayar.cikisBaslik || '📤 Personel Ayrıldı').setDescription(aciklama).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp();
                const files = gorselEmbedVeEkHazirla(embed, ayar.cikisArkaPlanUrl);
                await kanal.send({ embeds: [embed], files }).catch(() => {});
            }
        }
    } catch (_) {}
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const guild = newState.guild || oldState.guild;
        const ayar = sunucuAyarGetir(guild.id);
        const uye = newState.member || oldState.member;
        if (!uye || uye.user.bot) return;

        const key = `${guild.id}_${uye.id}`;
        if (ayar.moduller.nobet) {
            if (!oldState.channelId && newState.channelId) {
                aktifNobetBaslangic.set(key, Date.now());
            } else if (oldState.channelId && !newState.channelId) {
                const baslangic = aktifNobetBaslangic.get(key);
                if (baslangic) {
                    const gecenSn = Math.max(1, Math.floor((Date.now() - baslangic) / 1000));
                    aktifNobetBaslangic.delete(key);
                    if (!ayar.nobetSureleri[uye.id]) ayar.nobetSureleri[uye.id] = { username: uye.displayName, toplamSaniye: 0 };
                    ayar.nobetSureleri[uye.id].username = uye.displayName;
                    ayar.nobetSureleri[uye.id].toplamSaniye += gecenSn;
                    ayar.nobetSureleri[uye.id].sonGuncelleme = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
                    dbKaydet();
                }
            }
        }

        if (oldState.channelId && ayar.ozelSesOdalari?.[oldState.channelId]) {
            const eskiKanal = oldState.channel;
            if (eskiKanal && eskiKanal.members.size === 0 && ayar.ozelSesOdalari[oldState.channelId].otomatikSil) {
                delete ayar.ozelSesOdalari[oldState.channelId];
                dbKaydet();
                await eskiKanal.delete('Özel ses odası boşaldı').catch(() => {});
                logEkle(guild.id, 'SES', 'Özel Oda Otomatik Silindi', eskiKanal.name, 'Sistem');
            }
        }

        let detay = '';
        if (!oldState.channelId && newState.channelId) detay = `🔊 **${newState.channel.name}** kanalına katıldı.`;
        else if (oldState.channelId && !newState.channelId) detay = `🔇 **${oldState.channel.name}** kanalından ayrıldı.`;
        else if (oldState.channelId !== newState.channelId) detay = `🔀 **${oldState.channel.name}** → **${newState.channel.name}** geçti.`;
        else return;

        logEkle(guild.id, 'SES', 'Ses Hareketi', detay.replace(/\*\*/g, ''), uye.user.tag);
        if (ayar.sesLogKanal) {
            const k = guild.channels.cache.get(ayar.sesLogKanal);
            if (k) k.send({ embeds: [new EmbedBuilder().setColor('#8b5cf6').setAuthor({ name: uye.user.tag, iconURL: uye.user.displayAvatarURL() }).setDescription(detay).setTimestamp()] }).catch(() => {});
        }
    } catch (_) {}
});

// ============================================================================
// 12. EXPRESS WEB SUNUCUSU, ROWIFI ROBLOX OAUTH 2.0 VE TÜM API UÇ NOKTALARI
// ============================================================================
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/kayitlar', express.static(KAYITLAR_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function yetkiliOturumKontrol(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token || '');
    const oturum = sessions.get(token);
    if (!oturum) return res.status(401).json({ hata: 'Oturum geçersiz.' });
    req.oturum = oturum;
    next();
}

// --- ROWIFI TARZI ROBLOX OAUTH 2.0 GİRİŞ VE GERİ DÖNÜŞ ROTALARI ---
app.get('/auth/roblox', (req, res) => {
    const state = String(req.query.state || '');
    const oturum = pendingRobloxOAuth.get(state);
    if (!oturum) {
        return res.status(400).send('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Süresi Dolmuş Bağlantı</title></head><body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#131b2b;border:1px solid #ef4444;padding:30px;border-radius:14px;text-align:center;"><h2>❌ Doğrulama Bağlantısının Süresi Dolmuş</h2><p style="color:#94a3b8;">Lütfen Discord üzerinden tekrar <code>/verify</code> veya <code>/update</code> yazarak yeni bağlantı alın.</p></div></body></html>');
    }
    if (!ROBLOX_CLIENT_ID) {
        return res.status(500).send('<h2>❌ Sunucuda ROBLOX_CLIENT_ID ortam değişkeni tanımlanmamış.</h2>');
    }
    const authUrl = `https://apis.roblox.com/oauth/v1/authorize?client_id=${encodeURIComponent(ROBLOX_CLIENT_ID)}&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT_URI)}&scope=openid%20profile&response_type=code&state=${encodeURIComponent(state)}`;
    res.redirect(authUrl);
});

app.get('/auth/roblox/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error || !code || !state) {
        return res.status(400).send('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>İptal Edildi</title></head><body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#131b2b;border:1px solid #ef4444;padding:30px;border-radius:14px;text-align:center;"><h2>❌ Roblox Yetkilendirmesi İptal Edildi</h2><p style="color:#94a3b8;">Tekrar denemek için Discord\'da <code>/verify</code> yazabilirsiniz.</p></div></body></html>');
    }

    const oturum = pendingRobloxOAuth.get(String(state));
    if (!oturum) {
        return res.status(400).send('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Oturum Doldu</title></head><body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#131b2b;border:1px solid #ef4444;padding:30px;border-radius:14px;text-align:center;"><h2>❌ Doğrulama Oturumunun Süresi Dolmuş</h2><p style="color:#94a3b8;">Lütfen Discord\'da tekrar <code>/verify</code> yazın.</p></div></body></html>');
    }
    pendingRobloxOAuth.delete(String(state));

    try {
        const basicAuth = Buffer.from(`${ROBLOX_CLIENT_ID}:${ROBLOX_CLIENT_SECRET}`).toString('base64');
        const tokenRes = await guvenliFetch('https://apis.roblox.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: String(code),
                redirect_uri: ROBLOX_REDIRECT_URI
            }).toString()
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || tokenData.error || 'Roblox erişim anahtarı alınamadı.');
        }

        const userRes = await guvenliFetch('https://apis.roblox.com/oauth/v1/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const rUser = await userRes.json();
        if (!userRes.ok || !rUser.sub) {
            throw new Error('Roblox kullanıcı profili alınamadı.');
        }

        const robloxId = String(rUser.sub);
        const robloxUsername = String(rUser.preferred_username || rUser.name || `User_${robloxId}`);

        const ayar = sunucuAyarGetir(oturum.guildId);
        const kara = (ayar.karaListe || []).find(k => k.robloxId === robloxId || k.discordId === oturum.userId);
        if (kara) {
            return res.status(403).send(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Kara Liste</title></head><body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#131b2b;border:1px solid #ef4444;padding:30px;border-radius:14px;text-align:center;"><h2>⛔ Ortak Kara Liste Engeli</h2><p style="color:#fca5a5;">Bu hesap kara listededir. Sebep: <strong>${kara.sebep}</strong></p></div></body></html>`);
        }

        verifyKaydet(oturum.userId, robloxId, robloxUsername, 'OAuth2', oturum.guildId);

        let rolDurumHtml = '<div><strong>ℹ️ Durum:</strong> Hesap bağlandı. Discord\'da <code>/update</code> yazarak rollerinizi yenileyebilirsiniz.</div>';
        const guild = client.guilds.cache.get(oturum.guildId);
        if (guild) {
            const member = await guild.members.fetch(oturum.userId).catch(() => null);
            if (member) {
                logEkle(guild.id, 'RUTBE', 'Roblox OAuth 2.0 Doğrulama', `${member.user.tag} ↔ ${robloxUsername} (${robloxId})`, member.user.tag);
                try {
                    const sync = await kullaniciRolleriniGuncelle(guild, member, ayar, robloxUsername);
                    const eklenen = sync.eklenenRoller.map(r => r.name).join(', ') || 'Zaten güncel';
                    rolDurumHtml = `
                        <div><strong>🎖️ TSF Grup Rütbesi:</strong> ${sync.grupBilgi.roleName} (Rank ${sync.grupBilgi.rank})</div>
                        <div style="margin-top:6px;"><strong>🛡️ Atanan Discord Rolü:</strong> ${eklenen}</div>
                    `;
                } catch (syncErr) {
                    rolDurumHtml = `<div><strong>⚠️ Rol Senkronizasyon Notu:</strong> ${syncErr.message}</div>`;
                }
            }
        }

        res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ORDU YÖNETİMİ — Roblox Doğrulama Başarılı</title>
    <style>
        body { background: radial-gradient(circle at 20% 20%, rgba(59,130,246,0.18), transparent 45%), #090d16; color: #f8fafc; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .card { background: #131b2b; border: 1px solid #10b981; border-radius: 18px; padding: 36px 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.65); }
        .badge { display: inline-block; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.35); padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
        h1 { font-size: 23px; margin: 0 0 10px; color: #fff; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 18px; }
        .info-box { background: #0b101b; border: 1px solid #1e293b; border-radius: 12px; padding: 15px; text-align: left; font-size: 13.5px; line-height: 1.6; margin-bottom: 18px; }
        .footer { font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">✅ ROBLOX OAUTH 2.0 ONAYLANDI</div>
        <h1>Hesabınız Başarıyla Bağlandı!</h1>
        <p>Roblox hesabınız TSF Komuta Ağı ile eşleştirildi ve Discord rütbe rolleriniz kontrol edildi.</p>
        <div class="info-box">
            <div><strong>🎮 Roblox Kullanıcı Adı:</strong> ${robloxUsername}</div>
            <div style="margin-top:6px;"><strong>🆔 Roblox ID:</strong> ${robloxId}</div>
            <div style="margin-top:6px;">${rolDurumHtml}</div>
        </div>
        <div class="footer">Bu sekmeyi kapatıp Discord'a dönebilirsiniz.</div>
    </div>
</body>
</html>`);
    } catch (err) {
        console.error('Roblox OAuth Callback Hatası:', err);
        res.status(500).send(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Hata</title></head><body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#131b2b;border:1px solid #ef4444;padding:30px;border-radius:14px;text-align:center;"><h2>❌ Doğrulama Sırasında Hata Oluştu</h2><p style="color:#fca5a5;">${err.message}</p></div></body></html>`);
    }
});

// .PNG / .JPG GÖRSEL YÜKLEME ENDPOINTİ (Ticket ve Kartlar için)
app.post('/api/upload-gorsel', yetkiliOturumKontrol, (req, res) => {
    try {
        const { dataUrl, dosyaAdi } = req.body;
        const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
        if (!match) return res.status(400).json({ hata: 'Geçerli bir .png, .jpg, .webp veya .gif dosyası seçin.' });
        const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const guvenliAd = `${Date.now()}_${String(dosyaAdi || 'gorsel').replace(/[^a-z0-9]/gi, '').slice(0, 20)}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, guvenliAd), Buffer.from(match[2], 'base64'));
        res.json({ basarili: true, url: `/uploads/${guvenliAd}` });
    } catch (err) {
        res.status(500).json({ hata: err.message });
    }
});

app.get('/auth/discord', (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) return res.redirect('/?auth_error=' + encodeURIComponent('.env eksik!'));
    res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`);
});

app.get('/auth/discord/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) return res.redirect('/?auth_error=' + encodeURIComponent('Yetkilendirme kodu alınamadı.'));
        const tokenRes = await guvenliFetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code: String(code), redirect_uri: REDIRECT_URI }).toString()
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) return res.redirect('/?auth_error=' + encodeURIComponent('Token alınamadı.'));

        const [userRes, guildsRes] = await Promise.all([
            guvenliFetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
            guvenliFetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenData.access_token}` } })
        ]);
        const user = await userRes.json();
        const guilds = await guildsRes.json();
        const panelToken = crypto.randomBytes(32).toString('hex');
        const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png';

        sessions.set(panelToken, { id: user.id, username: user.global_name || user.username, avatar: avatarUrl, guilds: Array.isArray(guilds) ? guilds : [], isLocalAdmin: user.id === SUPER_ADMIN_ID });
        sessionKaydet();
        res.redirect(`/?token=${encodeURIComponent(panelToken)}&id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.global_name || user.username)}&avatar=${encodeURIComponent(avatarUrl)}`);
    } catch (err) {
        res.redirect('/?auth_error=' + encodeURIComponent(err.message));
    }
});

app.post('/auth/local-login', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const yerelMi = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost');
    if (!yerelMi && process.env.ALLOW_REMOTE_LOCAL_LOGIN !== 'true') return res.status(403).json({ hata: 'Sadece localhost.' });

    const panelToken = crypto.randomBytes(32).toString('hex');
    const avatarUrl = client.user?.displayAvatarURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const username = 'Başkomutan (Yerel)';
    sessions.set(panelToken, { id: 'local_admin', username, avatar: avatarUrl, guilds: [], isLocalAdmin: true });
    sessionKaydet();
    res.json({ basarili: true, token: panelToken, user: { id: 'local_admin', username, avatar: avatarUrl } });
});

app.get('/api/sunucular', yetkiliOturumKontrol, (req, res) => {
    const botGuilds = Array.from(client.guilds.cache.values());
    const uygun = (req.oturum.isLocalAdmin || req.oturum.id === SUPER_ADMIN_ID) ? botGuilds : botGuilds.filter(bg => {
        const ug = (req.oturum.guilds || []).find(g => g.id === bg.id);
        if (!ug) return false;
        const p = BigInt(ug.permissions || 0);
        return ug.owner || (p & BigInt(0x8)) === BigInt(0x8) || (p & BigInt(0x20)) === BigInt(0x20);
    });
    res.json({ sunucular: uygun.map(g => ({ id: g.id, name: g.name, icon: g.iconURL({ size: 128 }) || '' })) });
});

app.get('/api/panel/:guildId', yetkiliOturumKontrol, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });

    const ayarlar = sunucuAyarGetir(guild.id);
    const aktifOturum = aktifSesOturumlari.get(guild.id);
    const kayitlar = (db.sesKayitlari || []).filter(k => k.guildId === guild.id);

    const kapatilan = ayarlar.kapatilanBiletler || [];
    const acikListe = Object.values(ayarlar.acikBiletler || {}).filter(b => guild.channels.cache.has(b.kanalId));
    const puanlilar = kapatilan.filter(b => typeof b.puan === 'number');
    const ortPuan = puanlilar.length ? Number((puanlilar.reduce((a, b) => a + b.puan, 0) / puanlilar.length).toFixed(2)) : 0;
    const memnunSayi = puanlilar.filter(b => b.puan >= 4).length;
    const memnuniyetOrani = puanlilar.length ? Math.round((memnunSayi / puanlilar.length) * 100) : 0;

    const yetkiliMap = {};
    for (const b of kapatilan) {
        const y = b.ustlenenTag || b.kapatan || 'Bilinmiyor';
        if (!yetkiliMap[y]) yetkiliMap[y] = { yetkili: y, cozulmus: 0, puanToplam: 0, puanSayisi: 0, yorumlar: [] };
        yetkiliMap[y].cozulmus += 1;
        if (typeof b.puan === 'number') { yetkiliMap[y].puanToplam += b.puan; yetkiliMap[y].puanSayisi += 1; }
        if (b.yorum) yetkiliMap[y].yorumlar.push({ bilet: b.kanalAdi, puan: b.puan, yorum: b.yorum, tarih: b.kapanisTarihi });
    }
    const yetkiliKarnesi = Object.values(yetkiliMap).map(y => ({ ...y, ortalama: y.puanSayisi ? Number((y.puanToplam / y.puanSayisi).toFixed(2)) : 0 })).sort((a, b) => b.cozulmus - a.cozulmus);

    const terfiOnerileri = [];
    const hiyerarsi = ayarlar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;
    for (const [uid, xp] of Object.entries(ayarlar.leveling?.kullanicilar || {})) {
        const uye = guild.members.cache.get(uid);
        if (!uye || uye.user.bot) continue;
        const uyariSayisi = (ayarlar.uyarilar || []).filter(u => u.kullaniciId === uid).length;
        const nobetDk = Math.round((ayarlar.nobetSureleri?.[uid]?.toplamSaniye || 0) / 60);
        if (uyariSayisi === 0 && (xp.seviye >= 3 || nobetDk >= 60)) {
            const analiz = uyeRutbeVeKimlikAnaliz(guild, uye, ayarlar);
            const sonraki = (analiz.rutbeIndex >= 0 && analiz.rutbeIndex + 1 < hiyerarsi.length) ? hiyerarsi[analiz.rutbeIndex + 1].ad : hiyerarsi[0].ad;
            terfiOnerileri.push({ userId: uid, username: uye.displayName, mevcutRutbe: analiz.enYuksekRutbe, onerilenRutbe: sonraki, seviye: xp.seviye, nobetDk });
        }
    }

    const uyeler = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, name: `${m.displayName} (@${m.user.username})` })).slice(0, 250);
    const robloxRoller = await robloxGrupRolleriniGetir(ayarlar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID).catch(() => []);

    res.json({
        sunucuAdi: guild.name,
        sunucuIkon: guild.iconURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
        uyeSayisi: guild.memberCount,
        cevrimiciUye: guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size,
        kanalSayisi: guild.channels.cache.size,
        rolSayisi: guild.roles.cache.size,
        ping: client.ws.ping,
        uptimeSaniye: Math.floor(process.uptime()),
        sesDiagnostik: { voiceLib: !!VoiceLib, opusMotoru: opusEngineName, bulutDb: !!FIREBASE_DB_URL },
        ayarlar,
        robloxRoller,
        ticketIstatistik: { acikSayisi: acikListe.length, kapaliSayisi: kapatilan.length, toplamSayisi: acikListe.length + kapatilan.length, ortalamaPuan: ortPuan, memnuniyetOrani },
        acikBiletler: acikListe,
        yetkiliKarnesi,
        terfiOnerileri: terfiOnerileri.slice(0, 15),
        uyeler,
        metinKanallari: guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: '#' + c.name })),
        sesKanallari: guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).map(c => ({ id: c.id, name: '🔊 ' + c.name })),
        kategoriler: guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name })),
        roller: guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: '@' + r.name })),
        aktifSes: aktifOturum ? { aktif: true, kanalId: aktifOturum.kanalId, kanalAdi: aktifOturum.kanalAdi, alinanPaket: aktifOturum.alinanPaket } : { aktif: false },
        kayitlar
    });
});

app.post('/api/ayarlar', yetkiliOturumKontrol, (req, res) => {
    const { guildId, yeniAyarlar, aciklama } = req.body;
    if (!guildId || !yeniAyarlar) return res.status(400).json({ hata: 'Eksik parametre.' });
    const mevcut = sunucuAyarGetir(guildId);
    db.sunucular[guildId] = {
        ...mevcut,
        ...yeniAyarlar,
        tema: yeniAyarlar.tema ? { ...mevcut.tema, ...yeniAyarlar.tema } : mevcut.tema,
        moduller: yeniAyarlar.moduller ? { ...mevcut.moduller, ...yeniAyarlar.moduller } : mevcut.moduller,
        automod: yeniAyarlar.automod ? { ...mevcut.automod, ...yeniAyarlar.automod } : mevcut.automod,
        leveling: yeniAyarlar.leveling ? { ...mevcut.leveling, ...yeniAyarlar.leveling } : mevcut.leveling,
        sinavAyar: yeniAyarlar.sinavAyar ? { ...mevcut.sinavAyar, ...yeniAyarlar.sinavAyar } : mevcut.sinavAyar
    };
    logEkle(guildId, 'PANEL', 'Ayarlar Güncellendi', aciklama || 'Panel yapılandırması', req.oturum.username);
    res.json({ basarili: true });
});

// SİCİL: MADALYA & DİSİPLİN EKLE
app.post('/api/sicil/madalya', yetkiliOturumKontrol, (req, res) => {
    const { guildId, userId, ad, aciklama } = req.body;
    const ayar = sunucuAyarGetir(guildId);
    if (!ayar.sicilKayitlari[userId]) ayar.sicilKayitlari[userId] = { madalyalar: [], disiplin: [] };
    ayar.sicilKayitlari[userId].madalyalar.unshift({ id: crypto.randomUUID(), ad, aciklama: aciklama || 'Komuta taltifi', yetkili: req.oturum.username, tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) });
    logEkle(guildId, 'SICIL', 'Madalya Verildi', `${userId}: ${ad}`, req.oturum.username);
    res.json({ basarili: true });
});

app.post('/api/sicil/disiplin', yetkiliOturumKontrol, (req, res) => {
    const { guildId, userId, tur, sebep } = req.body;
    const ayar = sunucuAyarGetir(guildId);
    if (!ayar.sicilKayitlari[userId]) ayar.sicilKayitlari[userId] = { madalyalar: [], disiplin: [] };
    ayar.sicilKayitlari[userId].disiplin.unshift({ id: crypto.randomUUID(), tur, sebep, yetkili: req.oturum.username, tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) });
    logEkle(guildId, 'SICIL', 'Disiplin Kaydı', `${userId}: [${tur}] ${sebep}`, req.oturum.username);
    res.json({ basarili: true });
});

// KARA LİSTE EKLE / SİL
app.post('/api/karaliste', yetkiliOturumKontrol, async (req, res) => {
    const { guildId, discordId, robloxAdi, sebep } = req.body;
    const ayar = sunucuAyarGetir(guildId);
    let rUser = null;
    if (robloxAdi) rUser = await robloxKullaniciBul(robloxAdi).catch(() => null);
    ayar.karaListe.unshift({
        id: crypto.randomUUID(),
        discordId: (discordId || '').trim(),
        robloxId: rUser?.id || '',
        robloxUsername: rUser?.username || (robloxAdi || '').trim(),
        sebep: sebep || 'Komuta kara listesi',
        yetkili: req.oturum.username,
        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
    });
    logEkle(guildId, 'MODERASYON', 'Kara Listeye Eklendi', `${discordId || ''} ${robloxAdi || ''}`, req.oturum.username);
    res.json({ basarili: true });
});

app.delete('/api/karaliste/:guildId/:id', yetkiliOturumKontrol, (req, res) => {
    const ayar = sunucuAyarGetir(req.params.guildId);
    ayar.karaListe = (ayar.karaListe || []).filter(k => k.id !== req.params.id);
    dbKaydet();
    res.json({ basarili: true });
});

// ÇEKİLİŞ OLUŞTUR / BİTİR / REROLL
app.post('/api/cekilis/baslat', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, odul, sureDakika, kazananSayisi, sartRolId, sartMinSeviye, sartMinNobetDk } = req.body;
        const guild = client.guilds.cache.get(guildId);
        const kanal = guild?.channels.cache.get(kanalId);
        if (!kanal || !odul) return res.status(400).json({ hata: 'Kanal ve ödül zorunludur.' });
        const ayar = sunucuAyarGetir(guildId);
        const id = crypto.randomUUID().slice(0, 8);
        const bitisTimestamp = Date.now() + (Math.max(1, Number(sureDakika) || 60) * 60 * 1000);

        const sartlar = [];
        if (sartRolId) sartlar.push(`• Gerekli Rol: <@&${sartRolId}>`);
        if (Number(sartMinSeviye) > 0) sartlar.push(`• Min. Seviye: **${sartMinSeviye}**`);
        if (Number(sartMinNobetDk) > 0) sartlar.push(`• Min. Ses Nöbeti: **${sartMinNobetDk} dk**`);

        const embed = new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle(`🎉 ÇEKİLİŞ: ${odul}`)
            .setDescription(`Katılmak için butona tıklayın!\n\n⏰ **Bitiş:** <t:${Math.floor(bitisTimestamp / 1000)}:R>\n🏆 **Kazanan Sayısı:** ${kazananSayisi || 1}\n${sartlar.length ? '\n**Katılım Şartları:**\n' + sartlar.join('\n') : ''}`)
            .setFooter({ text: `ID: ${id} • Başlatan: ${req.oturum.username}` })
            .setTimestamp(bitisTimestamp);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cekilis_katil_${id}`).setLabel('🎉 Çekilişe Katıl (0)').setStyle(ButtonStyle.Success)
        );
        const msg = await kanal.send({ embeds: [embed], components: [row] });
        ayar.cekilisler.unshift({
            id, kanalId, mesajId: msg.id, odul, kazananSayisi: Number(kazananSayisi) || 1,
            bitisTimestamp, olusturan: req.oturum.username, bitti: false,
            katilanlar: [], kazananlar: [], sartRolId: sartRolId || '',
            sartMinSeviye: Number(sartMinSeviye) || 0, sartMinNobetDk: Number(sartMinNobetDk) || 0
        });
        logEkle(guildId, 'CEKILIS', 'Panelden Çekiliş Başlatıldı', odul, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/cekilis/:guildId/:id/:aksiyon', yetkiliOturumKontrol, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    const ayar = sunucuAyarGetir(req.params.guildId);
    const c = (ayar.cekilisler || []).find(x => x.id === req.params.id);
    if (!guild || !c) return res.status(404).json({ hata: 'Çekiliş bulunamadı.' });
    if (req.params.aksiyon === 'sil') {
        ayar.cekilisler = ayar.cekilisler.filter(x => x.id !== req.params.id);
        dbKaydet();
        return res.json({ basarili: true });
    }
    await cekilisSonlandir(guild, ayar, c, req.params.aksiyon === 'reroll');
    res.json({ basarili: true });
});

// CANLI SES ANONS (TTS)
app.post('/api/ses-anons', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.body.guildId);
        if (!guild || !req.body.kanalId || !req.body.metin) return res.status(400).json({ hata: 'Kanal ve anons metni zorunludur.' });
        await sesKanalinaAnonsYap(guild, req.body.kanalId, req.body.metin);
        logEkle(req.body.guildId, 'SES', 'Canlı TTS Anons', req.body.metin.slice(0, 60), req.oturum.username);
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// SES KAYIT OYNATMA (Yerel disk veya Discord CDN yedeğinden)
app.get('/api/ses-kayit/:id/dosya', (req, res) => {
    const kayit = (db.sesKayitlari || []).find(k => k.id === req.params.id);
    if (!kayit) return res.status(404).end();
    const yerel = path.join(KAYITLAR_DIR, kayit.dosyaAdi);
    if (fs.existsSync(yerel)) return res.sendFile(yerel);
    if (kayit.discordUrl) return res.redirect(kayit.discordUrl);
    res.status(404).end();
});

app.post('/api/ses-odasi/panel-kur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, kategoriId, baslik, aciklama, renk, butonAcik, butonOzel } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });
        if (!kanalId) return res.status(400).json({ hata: 'Lütfen panelin gönderileceği metin kanalını seçin!' });
        const kanal = guild.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Metin kanalı bulunamadı.' });

        const botUye = guild.members.me || await guild.members.fetchMe().catch(() => null);
        const izinler = botUye ? kanal.permissionsFor(botUye) : null;
        if (izinler && (!izinler.has(PermissionsBitField.Flags.SendMessages) || !izinler.has(PermissionsBitField.Flags.EmbedLinks))) {
            return res.status(403).json({ hata: `Botun #${kanal.name} kanalında Mesaj Gönder / Embed izni yok!` });
        }

        const ayar = sunucuAyarGetir(guildId);
        if (kategoriId !== undefined) ayar.ozelSesKategori = kategoriId;
        if (baslik) ayar.sesPanelBaslik = baslik;
        if (aciklama) ayar.sesPanelAciklama = aciklama;
        if (renk) ayar.sesPanelRenk = renk;
        dbKaydet();

        const embed = new EmbedBuilder()
            .setColor(renk || ayar.sesPanelRenk || ayar.tema?.primary || '#3b82f6')
            .setTitle(baslik || ayar.sesPanelBaslik || '🎙️ Özel Ses Odası Oluşturma Merkezi')
            .setDescription(aciklama || ayar.sesPanelAciklama || 'Aşağıdaki butonlarla ses odası oluşturabilirsiniz. Oda boşaldığında otomatik silinir.')
            .setFooter({ text: 'ORDU YÖNETİMİ • Dinamik Ses Odası Sistemi' })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ses_panel_acik_olustur').setLabel(butonAcik || '🔊 Herkese Açık Oda Oluştur').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ses_panel_ozel_olustur').setLabel(butonOzel || '🔒 Özel / Kilitli Oda Oluştur').setStyle(ButtonStyle.Primary)
        );
        await kanal.send({ embeds: [embed], components: [row] });
        logEkle(guildId, 'SES', 'Ses Odası Paneli Kuruldu', `#${kanal.name}`, req.oturum.username);
        res.json({ basarili: true, mesaj: `Özel Ses Odası paneli #${kanal.name} kanalına gönderildi!` });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/moderasyon/islem', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, userId, tur, sebep, dakika } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild || !userId) return res.status(400).json({ hata: 'Sunucu ve personel seçin.' });
        const ayar = sunucuAyarGetir(guildId);
        const member = await guild.members.fetch(userId).catch(() => null);
        const tag = member ? member.user.tag : userId;
        const temizSebep = sebep?.trim() || 'Komuta kararı';

        if (tur === 'uyar') {
            if (!member) return res.status(404).json({ hata: 'Üye bulunamadı.' });
            const r = await uyariEkleVeMerdivenUygula(guild, member, ayar, `${req.oturum.username} (Panel)`, temizSebep);
            return res.json({ basarili: true, mesaj: `${tag} uyarıldı (${r.toplam}. uyarı → ${r.uygulananCeza})` });
        }
        if (tur === 'sustur' && member) {
            const dk = Math.min(10080, Math.max(1, Number(dakika) || 10));
            await member.timeout(dk * 60 * 1000, temizSebep);
            return res.json({ basarili: true, mesaj: `${tag} ${dk} dk susturuldu.` });
        }
        if (tur === 'at' && member) { await member.kick(temizSebep); return res.json({ basarili: true, mesaj: `${tag} atıldı.` }); }
        if (tur === 'yasakla') { await guild.members.ban(userId, { reason: temizSebep }); return res.json({ basarili: true, mesaj: `${tag} yasaklandı.` }); }
        res.status(400).json({ hata: 'İşlem uygulanamadı.' });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.get('/api/ticket/acik/:guildId/:kanalId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const ayar = sunucuAyarGetir(req.params.guildId);
        const kanal = client.guilds.cache.get(req.params.guildId)?.channels.cache.get(req.params.kanalId);
        if (!kanal && !ayar.acikBiletler?.[req.params.kanalId]) return res.status(404).json({ hata: 'Bilet bulunamadı.' });
        if (kanal) {
            const fetched = await kanal.messages.fetch({ limit: 100 }).catch(() => null);
            if (fetched) for (const m of Array.from(fetched.values()).reverse()) ticketMesajKaydet(m);
        }
        const mesajlar = ayar.acikBiletler?.[req.params.kanalId]?.mesajlar || [];
        res.json({ basarili: true, kanalAdi: kanal?.name || ayar.acikBiletler?.[req.params.kanalId]?.kanalAdi || 'bilet', mesajlar });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.get('/api/sicil/:guildId/:userId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const member = await guild?.members.fetch(req.params.userId).catch(() => null);
        if (!member) return res.status(404).json({ hata: 'Personel bulunamadı.' });
        const ayar = sunucuAyarGetir(guild.id);
        const analiz = uyeRutbeVeKimlikAnaliz(guild, member, ayar);
        res.json({ basarili: true, avatar: member.user.displayAvatarURL({ size: 256 }), ...analiz, uyarilar: (ayar.uyarilar || []).filter(u => u.kullaniciId === member.id) });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/ses-odasi/olustur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, isim, limit, ozel, izinliUyeler, izinliRoller } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild || !isim) return res.status(400).json({ hata: 'Oda ismi zorunludur.' });
        const ayar = sunucuAyarGetir(guildId);
        const permissionOverwrites = [];
        if (ozel) {
            permissionOverwrites.push({ id: guild.id, deny: [PermissionsBitField.Flags.Connect] });
            for (const uid of (izinliUyeler || [])) if (uid) permissionOverwrites.push({ id: uid, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
            for (const rid of (izinliRoller || [])) if (rid) permissionOverwrites.push({ id: rid, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
        }
        const oda = await guild.channels.create({ name: `${ozel ? '🔒' : '🔊'} ${isim}`, type: ChannelType.GuildVoice, parent: ayar.ozelSesKategori || null, userLimit: Math.min(99, Math.max(0, Number(limit) || 0)), permissionOverwrites });
        ayar.ozelSesOdalari[oda.id] = { sahipId: req.oturum.id, otomatikSil: true, olusturma: Date.now() };
        res.json({ basarili: true, odaAdi: oda.name });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/ses-kayit/:id/tutanak', yetkiliOturumKontrol, async (req, res) => {
    try {
        const kayit = (db.sesKayitlari || []).find(k => k.id === req.params.id);
        if (!kayit) return res.status(404).json({ hata: 'Kayıt bulunamadı.' });
        const yerel = path.join(KAYITLAR_DIR, kayit.dosyaAdi);
        let wavBuf = null;
        if (fs.existsSync(yerel)) wavBuf = fs.readFileSync(yerel);
        else if (kayit.discordUrl) {
            const r = await guvenliFetch(kayit.discordUrl);
            if (r.ok) wavBuf = Buffer.from(await r.arrayBuffer());
        }
        if (!wavBuf) return res.status(404).json({ hata: 'WAV dosyası bulunamadı.' });
        if (wavBuf.length > 18 * 1024 * 1024) return res.status(400).json({ hata: 'Dosya 18 MB üzerinde.' });

        const tutanak = await geminiSor(
            'Askeri komuta toplantı sekreterisin. Ses kaydını analiz et ve 1) Toplantı Özeti, 2) Alınan Kararlar, 3) Görev Dağılımı başlıklarıyla Türkçe tutanak çıkar.',
            `Kanal: ${kayit.kanalAdi} (${kayit.tarih})`,
            [{ inlineData: { mimeType: 'audio/wav', data: wavBuf.toString('base64') } }]
        );
        kayit.tutanak = tutanak;
        dbKaydet(true);
        res.json({ basarili: true, tutanak });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/loa/:guildId/:id/durum', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const ayar = sunucuAyarGetir(req.params.guildId);
        const loa = (ayar.loaTalepleri || []).find(l => l.id === req.params.id);
        if (!loa) return res.status(404).json({ hata: 'Talep bulunamadı.' });
        loa.durum = req.body.durum;
        loa.yetkili = req.oturum.username;
        if (loa.durum === 'onaylandi' && guild) {
            loa.bitisTimestamp = Date.now() + (loa.gun * 24 * 60 * 60 * 1000);
            const member = await guild.members.fetch(loa.userId).catch(() => null);
            let rol = (ayar.izinliRolId && guild.roles.cache.get(ayar.izinliRolId)) || guild.roles.cache.find(r => r.name.toLowerCase().includes('izinli'));
            if (!rol) { rol = await guild.roles.create({ name: '[İZİNLİ]', color: '#f59e0b' }).catch(() => null); if (rol) ayar.izinliRolId = rol.id; }
            if (member && rol) await member.roles.add(rol).catch(() => {});
        }
        dbKaydet();
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/nobet/sifirla/:guildId', yetkiliOturumKontrol, (req, res) => {
    sunucuAyarGetir(req.params.guildId).nobetSureleri = {};
    dbKaydet();
    res.json({ basarili: true });
});

app.post('/api/operasyon/olustur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, tarihSaat, aciklama, etiketle } = req.body;
        const kanal = client.guilds.cache.get(guildId)?.channels.cache.get(kanalId);
        if (!kanal || !baslik || !tarihSaat) return res.status(400).json({ hata: 'Eksik bilgi.' });
        const ayar = sunucuAyarGetir(guildId);
        const opId = crypto.randomUUID().slice(0, 8);
        const embed = new EmbedBuilder().setColor('#ef4444').setTitle(`🎯 OPERASYON / EĞİTİM: ${baslik}`).setDescription(aciklama || 'Tüm personelin hazır bulunması gerekir.')
            .addFields({ name: '📅 Tarih & Saat', value: tarihSaat, inline: true }, { name: '✅ Katılacaklar (0)', value: 'Henüz yok' }, { name: '❌ Mazeretliler (0)', value: 'Henüz yok' }, { name: '🕒 Belki (0)', value: 'Henüz yok' }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`op_katil_${opId}`).setLabel('✅ Katılacağım').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`op_mazeret_${opId}`).setLabel('❌ Mazeretliyim').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`op_belki_${opId}`).setLabel('🕒 Belki').setStyle(ButtonStyle.Secondary)
        );
        const msg = await kanal.send({ content: etiketle ? '@everyone' : undefined, embeds: [embed], components: [row] });
        ayar.operasyonlar.unshift({ id: opId, baslik, tarihSaat, aciklama, kanalId, mesajId: msg.id, olusturan: req.oturum.username, katilanlar: [], mazeretliler: [], belki: [] });
        dbKaydet();
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.get('/api/roblox/roller/:guildId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const ayar = sunucuAyarGetir(req.params.guildId);
        const roller = await robloxGrupRolleriniGetir(ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID, req.query.yenile === '1');
        res.json({ basarili: true, roller });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/roblox/rutbe-ver', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, robloxKullaniciAdi, hedefRolId } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });
        const yetkiliMember = req.oturum.id !== 'local_admin' ? await guild.members.fetch(req.oturum.id).catch(() => null) : null;
        const sonuc = await tamRutbeIslemiYap({
            guild, robloxKullaniciAdi, hedefRolId,
            yetkiliMember, yetkiliUserId: req.oturum.id, yetkiliEtiket: `${req.oturum.username} (Panel)`
        });
        res.json({ basarili: true, mesaj: `${sonuc.robloxUser.username}: ${sonuc.eskiRolAdi} → ${sonuc.yeniRol.name} (Discord için /update gerekir)` });
    } catch (err) { res.status(400).json({ hata: err.message }); }
});

app.post('/api/ai-test', yetkiliOturumKontrol, async (req, res) => {
    try {
        const ayar = sunucuAyarGetir(req.body.guildId);
        const listeNot = /(rütbe|rutbe|hiyerarşi|liste)/i.test(req.body.soru || '') ? `\n\n[RESMİ TSF RÜTBE LİSTESİ]:\n${tamRutbeListesiMetni(ayar)}` : '';
        const yanit = await geminiSor(ayar.aiSistemTalimati + ' Rütbe listesi sorulursa tamamını eksiksiz listele.', (req.body.soru || '') + listeNot);
        res.json({ basarili: true, yanit });
    } catch (err) { res.status(500).json({ yanit: 'Hata: ' + err.message }); }
});

app.post('/api/ticket-kur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, aciklama, placeholder, footer, gorselUrl, renk } = req.body;
        const kanal = client.guilds.cache.get(guildId)?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Hedef metin kanalı bulunamadı.' });
        const ayar = sunucuAyarGetir(guildId);
        const konular = ayar.ticketKonular?.length ? ayar.ticketKonular : [{ id: 'genel', isim: 'Genel Destek', aciklama: 'Yardım', emoji: '🎫' }];

        const embed = new EmbedBuilder()
            .setColor(renk || ayar.ticketPanelRenk || '#3b82f6')
            .setTitle(baslik || ayar.ticketPanelBaslik || '🎫 Destek Merkezi')
            .setDescription(aciklama || ayar.ticketPanelAciklama || 'Kategori seçerek bilet açabilirsiniz.')
            .setFooter({ text: footer || ayar.ticketPanelFooter || 'ORDU YÖNETİMİ • Destek Sistemi' })
            .setTimestamp();
        const files = gorselEmbedVeEkHazirla(embed, gorselUrl || ayar.ticketPanelGorselUrl);
        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_kategori_sec')
            .setPlaceholder((placeholder || ayar.ticketMenuPlaceholder || '📂 Destek Kategorisi Seçin...').slice(0, 150))
            .addOptions(konular.slice(0, 25).map(k => ({
                label: k.isim.slice(0, 100),
                description: (k.aciklama || 'Destek').slice(0, 100),
                value: k.id,
                emoji: k.emoji || '🎫'
            })));

        await kanal.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], files });
        logEkle(guildId, 'TICKET', 'Ticket Paneli Kuruldu', `#${kanal.name}`, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/ses-dinle/baslat', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.body.guildId);
        if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });
        const oturum = await sesDinlemeBaslat(guild, req.body.kanalId, req.body.kayitYap);
        logEkle(req.body.guildId, 'SES', 'Canlı Dinleme Başlatıldı', `#${oturum.kanalAdi}`, req.oturum.username);
        res.json({ basarili: true, kanalAdi: oturum.kanalAdi });
    } catch (err) { res.status(400).json({ hata: err.message }); }
});

app.post('/api/ses-dinle/durdur', yetkiliOturumKontrol, async (req, res) => {
    const sonuc = await sesDinlemeDurdur(req.body.guildId);
    logEkle(req.body.guildId, 'SES', 'Canlı Dinleme Durduruldu', sonuc?.dosyaAdi || `Paket: ${sonuc?.alinanPaket || 0}`, req.oturum.username);
    res.json({ basarili: true, ...(sonuc || {}) });
});

app.get('/api/ses-dinle/stream/:guildId', yetkiliOturumKontrol, (req, res) => {
    const oturum = aktifSesOturumlari.get(req.params.guildId);
    if (!oturum) return res.status(404).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    oturum.streamClients.add(res);
    req.on('close', () => oturum.streamClients.delete(res));
});

app.delete('/api/ses-kayit/:id', yetkiliOturumKontrol, (req, res) => {
    const idx = (db.sesKayitlari || []).findIndex(k => k.id === req.params.id);
    if (idx !== -1) {
        const [silinen] = db.sesKayitlari.splice(idx, 1);
        const p = path.join(KAYITLAR_DIR, silinen.dosyaAdi);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        dbKaydet(true);
    }
    res.json({ basarili: true });
});

app.post('/api/duyuru', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, icerik, renk, gorselUrl, herkesiEtiketle } = req.body;
        const kanal = client.guilds.cache.get(guildId)?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });
        const embed = new EmbedBuilder().setColor(renk || '#3b82f6').setTitle(baslik || '📢 Duyuru').setDescription(icerik).setFooter({ text: req.oturum.username }).setTimestamp();
        const files = gorselEmbedVeEkHazirla(embed, gorselUrl);
        await kanal.send({ content: herkesiEtiketle ? '@everyone' : undefined, embeds: [embed], files });
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.delete('/api/uyari/:guildId/:uyariId', yetkiliOturumKontrol, (req, res) => {
    const ayar = sunucuAyarGetir(req.params.guildId);
    ayar.uyarilar = (ayar.uyarilar || []).filter(u => u.id !== req.params.uyariId);
    dbKaydet();
    res.json({ basarili: true });
});

// ============================================================================
// 13. BAŞLATMA
// ============================================================================
bulutDbYukle().finally(() => {
    app.listen(PORT, () => console.log(`🚀 ORDU YÖNETİMİ v5.1 http://localhost:${PORT} adresinde hazır.`));
});
if (!DISCORD_TOKEN) console.error('❌ DISCORD_TOKEN eksik!');
else client.login(DISCORD_TOKEN).catch(err => console.error('❌ Bot Giriş Hatası:', err.message));
