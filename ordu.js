// ============================================================================
// ORDU YÖNETİMİ (TSF) — KOMUTA & KONTROL BOTU + WEB PANEL SUNUCUSU (ordu.js)
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
    ChannelType,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

let VoiceLib = null;
try {
    VoiceLib = require('@discordjs/voice');
} catch (_) {
    console.warn('ℹ️ @discordjs/voice yüklü değil; canlı ses dinleme devre dışı.');
}

try {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        const { ProxyAgent, setGlobalDispatcher } = require('undici');
        setGlobalDispatcher(new ProxyAgent(proxyUrl));
    }
} catch (_) {}

// ============================================================================
// 1. YAPILANDIRMA VE RESMİ TSF RÜTBE HİYERARŞİSİ
// ============================================================================
const PORT = Number(process.env.PORT) || 3000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/discord/callback`).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const DEFAULT_ROBLOX_GROUP_ID = (process.env.ROBLOX_GROUP_ID || '137412624').trim();
const ROBLOX_API_KEY = (process.env.ROBLOX_API_KEY || '').trim();
const ROBLOX_COOKIE = (process.env.ROBLOX_COOKIE || '').trim();

const DB_PATH = path.join(__dirname, 'veritabani.json');
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');
const KAYITLAR_DIR = path.join(__dirname, 'kayitlar');
const KUFURLER_PATH = path.join(__dirname, 'kufurler.txt');
const KELIMELER_PATH = path.join(__dirname, 'kelimeler.txt');

if (!fs.existsSync(KAYITLAR_DIR)) {
    fs.mkdirSync(KAYITLAR_DIR, { recursive: true });
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
    { ad: 'Başkumandan', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Baş Geliştirici', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Yardımcı Grup Sahibi', sinif: 'Üst Komuta & Yönetim' },
    { ad: '[OF-10] Mareşal', sinif: 'Üst Komuta & Yönetim' },
    { ad: 'Grup Sahibi', sinif: 'Üst Komuta & Yönetim' }
];

// ============================================================================
// 2. TÜRKÇE NORMALİZASYON & AKILLI KÜFÜR FİLTRESİ
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

const yasakliSet = new Set();
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

        const norm = turkceNormalize(kelime).replace(/(.)\1{2,}/g, '$1');
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
// 3. KALICI VERİTABANI VE OTURUMLAR
// ============================================================================
function dbYukle() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Veritabanı okuma hatası:', e.message);
    }
    return { sunucular: {}, sesKayitlari: [] };
}

let db = dbYukle();
let dbSaveTimer = null;

function dbKaydet(hemen = false) {
    const yaz = () => {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        } catch (e) {
            console.error('Veritabanı yazma hatası:', e.message);
        }
    };
    if (hemen) {
        if (dbSaveTimer) clearTimeout(dbSaveTimer);
        yaz();
        return;
    }
    if (dbSaveTimer) clearTimeout(dbSaveTimer);
    dbSaveTimer = setTimeout(yaz, 300);
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
            ticket: true,
            rutbe: true,
            sesOdasi: true,
            sesDinleme: true,
            automod: true,
            seviye: true,
            karsilama: true,
            nobet: true,
            loa: true,
            operasyon: true
        },
        robloxGrupId: DEFAULT_ROBLOX_GROUP_ID,
        rutbeYetkiliRol: '',
        tsfRutbeler: JSON.parse(JSON.stringify(VARSAYILAN_TSF_RUTBELER)),
        aiAktif: true,
        aiIzinliKanallar: [],
        aiBaglamMesajSayisi: 10,
        aiSistemTalimati: 'Sen ORDU YÖNETİMİ (TSF) sunucusunun disiplinli, saygılı, stratejik düşünen ve Türkçeye tam uyumlu Komuta Yapay Zeka Asistanısın. Kullanıcılara rütbe bilincine uygun net ve doğru yanıtlar ver.',
        ticketKategori: '',
        ticketYetkiliRol: '',
        ticketAiAktif: true,
        ticketPanelGorselUrl: '',
        ticketPanelRenk: '#3b82f6',
        ticketKonular: [
            { id: 'rutbe_talebi', isim: 'Rütbe & Terfi Talebi', aciklama: 'TSF Roblox ve Discord rütbe eşitleme işlemleri', emoji: '🎖️', gorselUrl: '' },
            { id: 'sikayet_bildirim', isim: 'Disiplin & Şikayet Bildirimi', aciklama: 'Kural ihlali veya personel şikayetleri', emoji: '⚖️', gorselUrl: '' },
            { id: 'genel_destek', isim: 'Genel Komuta Desteği', aciklama: 'Sunucu ve operasyon hakkında sorularınız', emoji: '🎫', gorselUrl: '' }
        ],
        acikBiletler: {},
        kapatilanBiletler: [],
        ozelSesKategori: '',
        ozelSesOdalari: {},
        automod: {
            kufurEngel: true,
            linkEngel: false,
            capsEngel: false,
            spamEngel: true,
            tekrarMesajEngel: true,
            yeniHesapKorumaGun: 0,
            muafRol: '',
            yasakliKelimeler: [],
            cezaAksiyonu: 'sil_uyar',
            timeoutDakika: 5,
            otoCezaEsik: 3,
            otoCezaTimeoutDakika: 15
        },
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
        leveling: { ...varsayilan.leveling, ...(s.leveling || {}) }
    };
    if (!Array.isArray(db.sunucular[guildId].tsfRutbeler) || db.sunucular[guildId].tsfRutbeler.length === 0) {
        db.sunucular[guildId].tsfRutbeler = JSON.parse(JSON.stringify(VARSAYILAN_TSF_RUTBELER));
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
    if (ayar.logs.length > 350) ayar.logs.length = 350;
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
// 4. GÜVENLİ HTTP İSTEK YARDIMCISI
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

// ============================================================================
// 5. ROBLOX TSF RÜTBE MOTORU (GÜNCELLENMİŞ HİYERARŞİ & OTOMATİK YÜKLEME)
// ============================================================================
const robloxRolCache = new Map();

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

    // Yazım düzeltmelerini ve mükerrer temizliğini uygula
    const gorulenIsimler = new Set();
    const temizRoller = [];
    for (const r of roller.sort((a, b) => a.rank - b.rank)) {
        let ad = r.name
            .replace(/^OF-6\s+Tuğgeneral/i, '[OF-6] Tuğgeneral')
            .replace(/\[OF-7\]\s*Tumgeneral/i, '[OF-7] Tümgeneral')
            .replace(/^OF-10\s+Mareşal/i, '[OF-10] Mareşal')
            .trim();
        const anahtar = ad.toLocaleLowerCase('tr-TR');
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

// ============================================================================
// 6. GEMINI AI & ROL EŞLEŞTİRME MOTORU
// ============================================================================
async function geminiSor(sistemTalimati, kullaniciMesaji, extraParts = []) {
    if (!GEMINI_API_KEY) return '⚠️ GEMINI_API_KEY ortam değişkeni tanımlı değil.';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const parts = [{ text: kullaniciMesaji }, ...extraParts];
    const body = {
        systemInstruction: { parts: [{ text: sistemTalimati || 'Yardımcı bir asistansın.' }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 1200 }
    };

    const res = await guvenliFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API Hatası (${res.status}): ${errText.slice(0, 180)}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Yanıt üretilemedi.';
}

function uyeRutbeVeKimlikAnaliz(guild, member, ayar) {
    if (!member) return null;
    const roller = member.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => r.name);

    const hiyerarsi = ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;
    const temiz = s => turkceNormalize(s).replace(/[^a-z0-9]/g, '');

    let enYuksekRutbe = null;
    let enYuksekIndex = -1;

    for (let i = 0; i < hiyerarsi.length; i++) {
        const rAd = hiyerarsi[i].ad;
        const rTemiz = temiz(rAd);
        const rParantezsiz = temiz(rAd.replace(/^\[[^\]]+\]\s*/, ''));
        const eslesti = roller.some(rol => {
            const rt = temiz(rol);
            return rt === rTemiz || (rParantezsiz.length >= 3 && (rt === rParantezsiz || rt.includes(rParantezsiz)));
        });
        if (eslesti && i > enYuksekIndex) {
            enYuksekIndex = i;
            enYuksekRutbe = hiyerarsi[i];
        }
    }

    const xp = ayar.leveling?.kullanicilar?.[member.id] || { seviye: 1, xp: 0 };
    const uyariSayisi = (ayar.uyarilar || []).filter(u => u.kullaniciId === member.id).length;
    const nobetSn = ayar.nobetSureleri?.[member.id]?.toplamSaniye || 0;

    return {
        id: member.id,
        tag: member.user.tag,
        displayName: member.displayName,
        enYuksekRutbe: enYuksekRutbe ? `${enYuksekRutbe.ad} (${enYuksekRutbe.sinif})` : (roller[0] || 'Rütbesiz / Sivil'),
        rutbeIndex: enYuksekIndex,
        roller,
        seviye: xp.seviye,
        xp: xp.xp,
        uyariSayisi,
        nobetDakika: Math.round(nobetSn / 60)
    };
}

async function discordRutbeRoluBulVeEslestir(guild, robloxRutbeAdi) {
    const sunucuRolleri = Array.from(guild.roles.cache.values()).filter(r => !r.managed && r.id !== guild.id);
    const temiz = (s) => turkceNormalize(s).replace(/[^a-z0-9]/g, '');
    const hedefTemiz = temiz(robloxRutbeAdi);

    const kodEslesme = robloxRutbeAdi.match(/\b(OF|OR|WO|CW)[\s\-_]?(\d{1,2}(?:\/[ABC])?)\b/i);
    if (kodEslesme) {
        const kodTam = temiz(kodEslesme[1] + kodEslesme[2]);
        const rol = sunucuRolleri.find(r => temiz(r.name).includes(kodTam));
        if (rol) return rol;
    }

    const parantezSonrasi = robloxRutbeAdi.replace(/^\[[^\]]+\]\s*/, '').trim();
    const parantezTemiz = temiz(parantezSonrasi);
    if (parantezTemiz.length >= 2) {
        const isimRol = sunucuRolleri.find(r => {
            const rt = temiz(r.name);
            return rt === parantezTemiz || rt === hedefTemiz || (parantezTemiz.length >= 4 && rt.includes(parantezTemiz));
        });
        if (isimRol) return isimRol;
    }
    return null;
}

async function discordUyeRutbeSenkronizeEt(guild, member, yeniRobloxRol, tumRobloxRolleri) {
    if (!member) return { durum: 'Discord üyesi sunucuda bulunamadı.' };
    const eslesenRol = await discordRutbeRoluBulVeEslestir(guild, yeniRobloxRol.name);
    if (!eslesenRol) return { durum: `"${yeniRobloxRol.name}" için eşleşen Discord rolü bulunamadı.` };

    const kaldirilacaklar = [];
    for (const rRol of tumRobloxRolleri) {
        if (rRol.id === yeniRobloxRol.id) continue;
        const dRol = await discordRutbeRoluBulVeEslestir(guild, rRol.name);
        if (dRol && dRol.id !== eslesenRol.id && member.roles.cache.has(dRol.id)) {
            kaldirilacaklar.push(dRol.id);
        }
    }

    try {
        if (kaldirilacaklar.length > 0) await member.roles.remove(kaldirilacaklar).catch(() => {});
        if (!member.roles.cache.has(eslesenRol.id)) await member.roles.add(eslesenRol);
        return { durum: `<@&${eslesenRol.id}> rolü verildi.`, rol: eslesenRol };
    } catch (err) {
        return { durum: `Rol verilemedi: ${err.message}` };
    }
}

async function tamRutbeIslemiYap({ guild, robloxKullaniciAdi, hedefRolId, hedefDiscordMember, yetkiliEtiket }) {
    const ayar = sunucuAyarGetir(guild.id);
    const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;
    const [robloxUser, tumRoller] = await Promise.all([
        robloxKullaniciBul(robloxKullaniciAdi),
        robloxGrupRolleriniGetir(groupId, true)
    ]);

    const normAranan = turkceNormalize(String(hedefRolId));
    const hedefRol = tumRoller.find(r => String(r.id) === String(hedefRolId))
        || tumRoller.find(r => turkceNormalize(r.name) === normAranan)
        || tumRoller.find(r => turkceNormalize(r.name).includes(normAranan));

    if (!hedefRol) throw new Error(`"${hedefRolId}" rütbesi TSF Roblox grubunda bulunamadı.`);
    if (hedefRol.rank === 0 || hedefRol.rank === 255) throw new Error('Bu rütbe sistem tarafından atanamaz.');

    const mevcutBilgi = await robloxKullaniciGrupBilgisi(groupId, robloxUser.id);
    if (!mevcutBilgi) throw new Error(`${robloxUser.username} TSF Roblox grubuna üye değil.`);

    const sonuc = await robloxGrupRutbeDegistir(groupId, robloxUser.id, hedefRol);

    let uye = hedefDiscordMember;
    if (!uye) {
        await guild.members.fetch().catch(() => {});
        const aranan = robloxUser.username.toLowerCase();
        uye = guild.members.cache.find(m =>
            m.user.username.toLowerCase() === aranan ||
            m.displayName.toLowerCase().includes(aranan)
        ) || null;
    }

    const discordSonuc = await discordUyeRutbeSenkronizeEt(guild, uye, hedefRol, tumRoller);
    logEkle(guild.id, 'RUTBE', 'Rütbe Ataması', `${robloxUser.username}: ${mevcutBilgi.roleName} → ${hedefRol.name}`, yetkiliEtiket);

    return {
        robloxUser,
        eskiRolAdi: mevcutBilgi.roleName,
        yeniRol: hedefRol,
        yontem: sonuc.yontem,
        discordUye: uye,
        discordDurum: discordSonuc.durum
    };
}

// ============================================================================
// 7. CANLI SES DİNLEME & 48KHZ STEREO WAV KAYIT MOTORU
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

async function sesDinlemeBaslat(guild, kanalId, kayitYap = true) {
    if (!VoiceLib) throw new Error('Sunucuda @discordjs/voice paketi kurulu değil.');
    if (aktifSesOturumlari.has(guild.id)) await sesDinlemeDurdur(guild.id);

    const kanal = guild.channels.cache.get(kanalId);
    if (!kanal || kanal.type !== ChannelType.GuildVoice) {
        throw new Error('Geçerli bir ses kanalı bulunamadı.');
    }

    const connection = VoiceLib.joinVoiceChannel({
        channelId: kanal.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true
    });

    if (VoiceLib.entersState && VoiceLib.VoiceConnectionStatus) {
        await VoiceLib.entersState(connection, VoiceLib.VoiceConnectionStatus.Ready, 10_000).catch(() => {});
    }

    const oturum = {
        kanalId: kanal.id,
        kanalAdi: kanal.name,
        connection,
        streamClients: new Set(),
        kayitYap: !!kayitYap,
        pcmChunks: [],
        aktifStreamler: new Map(),
        baslangic: Date.now()
    };

    aktifSesOturumlari.set(guild.id, oturum);

    let prism = null;
    try { prism = require('prism-media'); } catch (_) {}

    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
        const uye = guild.members.cache.get(userId);
        const ad = uye ? uye.displayName : userId;
        sseGonder(oturum, { type: 'speaking', userId, kullaniciAdi: ad, durum: true });

        if (oturum.aktifStreamler.has(userId)) return;

        try {
            const opusStream = receiver.subscribe(userId, {
                end: { behavior: VoiceLib.EndBehaviorType.Manual }
            });

            if (prism) {
                const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
                opusStream.pipe(decoder);
                oturum.aktifStreamler.set(userId, { opusStream, decoder });

                decoder.on('data', (pcm) => {
                    if (!pcm || pcm.length === 0) return;
                    if (oturum.kayitYap) oturum.pcmChunks.push(Buffer.from(pcm));
                    if (oturum.streamClients.size > 0) {
                        sseGonder(oturum, { type: 'audio', userId, pcm: pcm.toString('base64') });
                    }
                });

                const temizle = () => oturum.aktifStreamler.delete(userId);
                decoder.on('end', temizle);
                decoder.on('error', temizle);
                opusStream.on('error', temizle);
            } else {
                oturum.aktifStreamler.set(userId, { opusStream, decoder: null });
                opusStream.on('end', () => oturum.aktifStreamler.delete(userId));
            }
        } catch (err) {
            oturum.aktifStreamler.delete(userId);
        }
    });

    receiver.speaking.on('end', (userId) => {
        sseGonder(oturum, { type: 'speaking', userId, durum: false });
    });

    return oturum;
}

async function sesDinlemeDurdur(guildId) {
    const oturum = aktifSesOturumlari.get(guildId);
    if (!oturum) return null;

    for (const { opusStream, decoder } of oturum.aktifStreamler.values()) {
        try { opusStream.destroy(); } catch (_) {}
        try { if (decoder) decoder.end(); } catch (_) {}
    }
    oturum.aktifStreamler.clear();
    await new Promise(r => setTimeout(r, 150));

    try { oturum.connection.destroy(); } catch (_) {}
    for (const res of oturum.streamClients) {
        try { res.end(); } catch (_) {}
    }
    aktifSesOturumlari.delete(guildId);

    let dosyaAdi = null;
    if (oturum.kayitYap && oturum.pcmChunks.length > 0) {
        const toplamPcm = Buffer.concat(oturum.pcmChunks);
        const wavBuffer = pcmToWavBuffer(toplamPcm);
        dosyaAdi = `kayit_${guildId}_${Date.now()}.wav`;
        fs.writeFileSync(path.join(KAYITLAR_DIR, dosyaAdi), wavBuffer);

        const sureSaniye = Math.max(1, Math.round(toplamPcm.length / (48000 * 2 * 2)));
        db.sesKayitlari.unshift({
            id: crypto.randomUUID(),
            guildId,
            kanalAdi: oturum.kanalAdi,
            dosyaAdi,
            sureSaniye,
            tutanak: '',
            tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
        dbKaydet(true);
    }

    return { dosyaAdi };
}

// ============================================================================
// 8. DISCORD BOT İSTEMCİSİ VE SLASH KOMUTLAR
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
        .setName('rütbe')
        .setDescription('TSF Roblox & Discord rütbe yönetim komutları')
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('TSF Roblox ve Discord rütbesi verir')
                .addStringOption(opt => opt.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true))
                .addStringOption(opt => opt.setName('rutbe').setDescription('Verilecek TSF rütbesi').setRequired(true).setAutocomplete(true))
                .addUserOption(opt => opt.setName('discord_uye').setDescription('Discord üyesi (opsiyonel)').setRequired(false))
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
        .setName('moderasyon')
        .setDescription('Gelişmiş komuta ve disiplin moderasyon işlemleri')
        .addSubcommand(sub =>
            sub.setName('uyar')
                .setDescription('Bir personele resmi uyarı verir')
                .addUserOption(opt => opt.setName('uye').setDescription('Uyarılacak üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Uyarı sebebi').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('uyarilar')
                .setDescription('Personelin sicil uyarı kayıtlarını listeler')
                .addUserOption(opt => opt.setName('uye').setDescription('Sorgulanacak üye').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('sustur')
                .setDescription('Üyeye süreli susturma (timeout) uygular')
                .addUserOption(opt => opt.setName('uye').setDescription('Susturulacak üye').setRequired(true))
                .addIntegerOption(opt => opt.setName('dakika').setDescription('Süre (dakika)').setMinValue(1).setMaxValue(10080).setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('at')
                .setDescription('Üyeyi sunucudan atar (Kick)')
                .addUserOption(opt => opt.setName('uye').setDescription('Atılacak üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('yasakla')
                .setDescription('Üyeyi sunucudan kalıcı yasaklar (Ban)')
                .addUserOption(opt => opt.setName('uye').setDescription('Yasaklanacak üye').setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Sebep').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('temizle')
                .setDescription('Kanaldaki son mesajları toplu siler')
                .addIntegerOption(opt => opt.setName('adet').setDescription('Silinecek mesaj sayısı (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('kilit')
                .setDescription('Kanalı mesaj gönderimine kilitler veya açar')
                .addBooleanOption(opt => opt.setName('durum').setDescription('True = Kilitle, False = Kilidi Aç').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('ses-odasi')
        .setDescription('Özel veya herkese açık ses odası oluşturur')
        .addSubcommand(sub =>
            sub.setName('olustur')
                .setDescription('Yeni bir ses odası oluşturur')
                .addStringOption(opt => opt.setName('isim').setDescription('Oda ismi').setRequired(true))
                .addIntegerOption(opt => opt.setName('limit').setDescription('Kişi limiti (0 = sınırsız, 1-99)').setMinValue(0).setMaxValue(99).setRequired(false))
                .addBooleanOption(opt => opt.setName('ozel').setDescription('Oda özel/kilitli olsun mu?').setRequired(false))
                .addUserOption(opt => opt.setName('izinli_uye').setDescription('Özel odaya girebilecek üye').setRequired(false))
                .addRoleOption(opt => opt.setName('izinli_rol').setDescription('Özel odaya girebilecek rol').setRequired(false))
        ),
    new SlashCommandBuilder()
        .setName('izin')
        .setDescription('İzin / Mazeret (LOA) talep sistemi')
        .addSubcommand(sub =>
            sub.setName('talep')
                .setDescription('Komuta merkezine izin/mazeret (LOA) talebi gönderir')
                .addIntegerOption(opt => opt.setName('gun').setDescription('İzin süresi (gün)').setMinValue(1).setMaxValue(60).setRequired(true))
                .addStringOption(opt => opt.setName('sebep').setDescription('Mazeret / İzin sebebi').setRequired(true))
        ),
    new SlashCommandBuilder()
        .setName('kimlik')
        .setDescription('Personel sicil, rütbe, nöbet ve seviye kartını gösterir')
        .addUserOption(opt => opt.setName('uye').setDescription('Görüntülenecek personel').setRequired(false)),
    new SlashCommandBuilder()
        .setName('yardim')
        .setDescription('ORDU YÖNETİMİ botunun tüm komutlarını gösterir')
];

async function slashKomutlariKaydet() {
    if (!DISCORD_TOKEN || !CLIENT_ID) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const body = slashKomutlar.map(c => c.toJSON());
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
        for (const guild of client.guilds.cache.values()) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body }).catch(() => {});
        }
        console.log('⚡ Slash komutları kaydedildi.');
    } catch (err) {
        console.error('⚠️ Slash komut kayıt uyarısı:', err.message);
    }
}

client.once('ready', async () => {
    console.log(`👑 ORDU YÖNETİMİ Bot Aktif: ${client.user.tag}`);
    client.user.setActivity('TSF Komuta Ağı | /yardim', { type: 3 });
    await slashKomutlariKaydet();

    // Periyodik LOA Süre Kontrolü
    setInterval(async () => {
        const simdi = Date.now();
        for (const [guildId, ayar] of Object.entries(db.sunucular)) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild || !ayar.loaTalepleri) continue;
            let degisti = false;
            for (const loa of ayar.loaTalepleri) {
                if (loa.durum === 'onaylandi' && loa.bitisTimestamp && simdi >= loa.bitisTimestamp) {
                    loa.durum = 'tamamlandi';
                    degisti = true;
                    const member = await guild.members.fetch(loa.userId).catch(() => null);
                    const rol = (ayar.izinliRolId && guild.roles.cache.get(ayar.izinliRolId))
                        || guild.roles.cache.find(r => r.name.toLowerCase().includes('izinli'));
                    if (member && rol && member.roles.cache.has(rol.id)) {
                        await member.roles.remove(rol).catch(() => {});
                    }
                    logEkle(guildId, 'LOA', 'İzin Süresi Doldu', `${loa.username} görevine döndü`, 'Sistem');
                }
            }
            if (degisti) dbKaydet();
        }
    }, 5 * 60 * 1000);
});

client.on('error', (err) => console.error('⚠️ Discord Client Hatası:', err?.message || err));

// Yardımcı: Mod Log Kanalına Embed Gönder
async function modLogEmbedGonder(guild, ayar, embed) {
    const hedefId = ayar.modLogKanal || ayar.mesajLogKanal;
    if (!hedefId) return;
    const kanal = guild.channels.cache.get(hedefId);
    if (kanal) await kanal.send({ embeds: [embed] }).catch(() => {});
}

// ============================================================================
// 9. ETKİLEŞİMLER (SLASH, AUTOCOMPLETE, SES ODASI PANELİ, TICKET, MODAL)
// ============================================================================
client.on('interactionCreate', async (interaction) => {
    try {
        // 1. AUTOCOMPLETE (/rütbe ver -> rutbe)
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'rütbe') {
                const aranan = turkceNormalize(interaction.options.getFocused());
                const ayar = sunucuAyarGetir(interaction.guildId);
                let roller = await robloxGrupRolleriniGetir(ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID).catch(() => []);

                // Eğer Roblox API yanıt vermezse kayıtlı TSF hiyerarşisini yedek olarak kullan
                if (roller.length === 0) {
                    roller = (ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER).map((r, idx) => ({
                        id: r.ad,
                        name: r.ad,
                        rank: idx + 1
                    }));
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

            if (interaction.commandName === 'yardim') {
                const embed = new EmbedBuilder()
                    .setColor(ayar.tema.primary || '#3b82f6')
                    .setTitle(`🎖️ ${ayar.tema.baslik} — Komuta Rehberi`)
                    .addFields(
                        { name: '🎖️ Rütbe & Sicil', value: '`/rütbe ver`, `/rütbe sorgula`, `/rütbe liste`, `/kimlik`' },
                        { name: '⚖️ Moderasyon', value: '`/moderasyon uyar`, `/moderasyon uyarilar`, `/moderasyon sustur`, `/moderasyon at`, `/moderasyon yasakla`, `/moderasyon temizle`, `/moderasyon kilit`' },
                        { name: '🎙️ Özel Ses Odası & İzin', value: '`/ses-odasi olustur` — Özel/limitli ses odası\n`/izin talep` — Mazeret/LOA talebi' }
                    );
                return interaction.reply({ embeds: [embed], ephemeral: true });
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
                        { name: '🎖️ Mevcut Rütbe', value: `**${analiz?.enYuksekRutbe || 'Bilinmiyor'}**`, inline: true },
                        { name: '🏆 Seviye & XP', value: `Seviye **${analiz?.seviye || 1}** (${analiz?.xp || 0} XP)`, inline: true },
                        { name: '⏱️ Haftalık Nöbet', value: `**${analiz?.nobetDakika || 0} dk**`, inline: true },
                        { name: '⚠️ Sicil Uyarı', value: `${analiz?.uyariSayisi || 0} Kayıt`, inline: true },
                        { name: '🎭 Roller', value: analiz?.roller?.slice(0, 12).join(', ') || 'Rol yok' }
                    );
                return interaction.reply({ embeds: [embed] });
            }

            // GELİŞMİŞ SLASH MODERASYON KOMUTLARI
            if (interaction.commandName === 'moderasyon') {
                const alt = interaction.options.getSubcommand();
                const yoneticiMi = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                if (alt === 'uyarilar') {
                    const hedef = interaction.options.getUser('uye');
                    const liste = (ayar.uyarilar || []).filter(u => u.kullaniciId === hedef.id);
                    const embed = new EmbedBuilder()
                        .setColor('#f59e0b')
                        .setTitle(`📋 Sicil Uyarı Kayıtları — ${hedef.tag}`)
                        .setDescription(liste.length
                            ? liste.slice(0, 15).map((u, idx) => `**${idx + 1}.** \`${u.tarih}\` — **${u.sebep}** *(Yetkili: ${u.yetkili})*`).join('\n')
                            : 'Bu personelin kayıtlı uyarısı bulunmuyor.');
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (alt === 'uyar') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ content: '❌ Uyarı verme yetkiniz yok.', ephemeral: true });
                    }
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id).catch(() => null);
                    const sebep = interaction.options.getString('sebep');

                    ayar.uyarilar.unshift({
                        id: crypto.randomUUID(),
                        kullaniciId: hedef.id,
                        kullaniciTag: hedef.tag,
                        yetkili: interaction.user.tag,
                        sebep,
                        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
                    });
                    const toplam = ayar.uyarilar.filter(u => u.kullaniciId === hedef.id).length;
                    const esik = Number(ayar.automod.otoCezaEsik) || 3;
                    let otoNot = '';

                    if (member && toplam >= esik) {
                        const dk = Number(ayar.automod.otoCezaTimeoutDakika) || 15;
                        await member.timeout(dk * 60 * 1000, `Uyarı eşiği (${toplam}/${esik})`).catch(() => {});
                        otoNot = `\n🔇 Uyarı eşiği (${esik}) dolduğu için **${dk} dakika** susturma uygulandı.`;
                    }

                    logEkle(interaction.guildId, 'MODERASYON', 'Resmi Uyarı', `${hedef.tag}: ${sebep} (${toplam}. uyarı)`, interaction.user.tag);
                    const embed = new EmbedBuilder()
                        .setColor('#f59e0b')
                        .setTitle('⚠️ Resmi Disiplin Uyarısı')
                        .setDescription(`**Personel:** ${hedef} (\`${hedef.tag}\`)\n**Yetkili:** ${interaction.user}\n**Sebep:** ${sebep}\n**Toplam Uyarı:** ${toplam}${otoNot}`)
                        .setTimestamp();
                    await modLogEmbedGonder(interaction.guild, ayar, embed);
                    return interaction.reply({ embeds: [embed] });
                }

                if (alt === 'sustur') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                        return interaction.reply({ content: '❌ Susturma yetkiniz yok.', ephemeral: true });
                    }
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id);
                    const dakika = interaction.options.getInteger('dakika');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı';
                    await member.timeout(dakika * 60 * 1000, sebep);
                    logEkle(interaction.guildId, 'MODERASYON', `Susturma (${dakika} dk)`, `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    const embed = new EmbedBuilder()
                        .setColor('#ef4444')
                        .setTitle('🔇 Süreli Susturma (Timeout)')
                        .setDescription(`**Personel:** ${hedef}\n**Süre:** ${dakika} dakika\n**Yetkili:** ${interaction.user}\n**Sebep:** ${sebep}`)
                        .setTimestamp();
                    await modLogEmbedGonder(interaction.guild, ayar, embed);
                    return interaction.reply({ embeds: [embed] });
                }

                if (alt === 'at') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                        return interaction.reply({ content: '❌ Sunucudan atma yetkiniz yok.', ephemeral: true });
                    }
                    const hedef = interaction.options.getUser('uye');
                    const member = await interaction.guild.members.fetch(hedef.id);
                    const sebep = interaction.options.getString('sebep') || 'Disiplin kararı';
                    await member.kick(sebep);
                    logEkle(interaction.guildId, 'MODERASYON', 'Sunucudan Atıldı (Kick)', `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#ef4444').setTitle('👢 Personel Sunucudan Atıldı').setDescription(`**Kullanıcı:** ${hedef.tag}\n**Sebep:** ${sebep}`)] });
                }

                if (alt === 'yasakla') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                        return interaction.reply({ content: '❌ Yasaklama yetkiniz yok.', ephemeral: true });
                    }
                    const hedef = interaction.options.getUser('uye');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı';
                    await interaction.guild.members.ban(hedef.id, { reason: sebep });
                    logEkle(interaction.guildId, 'MODERASYON', 'Yasaklandı (Ban)', `${hedef.tag}: ${sebep}`, interaction.user.tag);
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#dc2626').setTitle('🔨 Sunucudan Kalıcı Yasaklandı').setDescription(`**Kullanıcı:** ${hedef.tag}\n**Sebep:** ${sebep}`)] });
                }

                if (alt === 'temizle') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                        return interaction.reply({ content: '❌ Mesaj silme yetkiniz yok.', ephemeral: true });
                    }
                    const adet = interaction.options.getInteger('adet');
                    const silinen = await interaction.channel.bulkDelete(adet, true);
                    logEkle(interaction.guildId, 'MODERASYON', 'Toplu Mesaj Silindi', `#${interaction.channel.name} (${silinen.size} mesaj)`, interaction.user.tag);
                    return interaction.reply({ content: `🧹 **${silinen.size}** adet mesaj temizlendi.`, ephemeral: true });
                }

                if (alt === 'kilit') {
                    if (!yoneticiMi && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                        return interaction.reply({ content: '❌ Kanal yönetme yetkiniz yok.', ephemeral: true });
                    }
                    const durum = interaction.options.getBoolean('durum');
                    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: durum ? false : null });
                    logEkle(interaction.guildId, 'MODERASYON', durum ? 'Kanal Kilitlendi' : 'Kanal Kilidi Açıldı', `#${interaction.channel.name}`, interaction.user.tag);
                    return interaction.reply(durum ? '🔒 Kanal mesaj gönderimine kilitlendi.' : '🔓 Kanal kilidi kaldırıldı.');
                }
            }

            if (interaction.commandName === 'ses-odasi') {
                if (!ayar.moduller.sesOdasi) return interaction.reply({ content: '❌ Özel ses odası modülü kapalı.', ephemeral: true });
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
                logEkle(interaction.guildId, 'SES', 'Özel Ses Odası Oluşturuldu', `${oda.name} (Limit: ${limit || 'Sınırsız'})`, interaction.user.tag);
                return interaction.reply({ content: `✅ Ses odanız oluşturuldu: <#${oda.id}> (Boşaldığında otomatik silinecektir.)`, ephemeral: true });
            }

            if (interaction.commandName === 'izin') {
                if (!ayar.moduller.loa) return interaction.reply({ content: '❌ İzin/Mazeret modülü kapalı.', ephemeral: true });
                const gun = interaction.options.getInteger('gun');
                const sebep = interaction.options.getString('sebep');
                ayar.loaTalepleri.unshift({
                    id: crypto.randomUUID(),
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                    gun,
                    sebep,
                    durum: 'beklemede',
                    tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    bitisTimestamp: null,
                    yetkili: ''
                });
                logEkle(interaction.guildId, 'LOA', 'İzin Talebi Oluşturuldu', `${gun} gün — ${sebep}`, interaction.user.tag);
                return interaction.reply({ content: `✅ **${gun} günlük** izin talebiniz komuta merkezine iletildi.`, ephemeral: true });
            }

            if (interaction.commandName === 'rütbe') {
                if (!ayar.moduller.rutbe) return interaction.reply({ content: '❌ Rütbe modülü kapalı.', ephemeral: true });
                await interaction.deferReply();
                const alt = interaction.options.getSubcommand();
                const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;

                if (alt === 'liste') {
                    const metin = (ayar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER)
                        .map((r, i) => `\`${i + 1}.\` **${r.ad}** — *${r.sinif}*`)
                        .join('\n');
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor('#f59e0b').setTitle('🎖️ Güncel TSF Rütbe Hiyerarşisi').setDescription(metin.slice(0, 4000))]
                    });
                }

                if (alt === 'sorgula') {
                    const rUser = await robloxKullaniciBul(interaction.options.getString('kullanici'));
                    const bilgi = await robloxKullaniciGrupBilgisi(groupId, rUser.id);
                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#3b82f6')
                            .setTitle(`🔍 TSF Personel Sorgu — ${rUser.username}`)
                            .setThumbnail(rUser.avatarUrl)
                            .addFields(
                                { name: 'Roblox ID', value: `\`${rUser.id}\``, inline: true },
                                { name: 'Mevcut Grup Rütbesi', value: bilgi ? `**${bilgi.roleName}** (Rank ${bilgi.rank})` : '❌ Üye Değil', inline: true }
                            )]
                    });
                }

                const yoneticiMi = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles);
                const yetkiliRolVarMi = ayar.rutbeYetkiliRol && interaction.member.roles.cache.has(ayar.rutbeYetkiliRol);
                if (!yoneticiMi && !yetkiliRolVarMi) return interaction.editReply('❌ Rütbe verme yetkiniz yok.');

                if (alt === 'ver') {
                    const kAdi = interaction.options.getString('kullanici');
                    const hedefRolId = interaction.options.getString('rutbe');
                    const dUser = interaction.options.getUser('discord_uye');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı ile terfi';
                    const dMember = dUser ? await interaction.guild.members.fetch(dUser.id).catch(() => null) : null;

                    const sonuc = await tamRutbeIslemiYap({
                        guild: interaction.guild,
                        robloxKullaniciAdi: kAdi,
                        hedefRolId,
                        hedefDiscordMember: dMember,
                        yetkiliEtiket: interaction.user.tag
                    });

                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#10b981')
                            .setTitle('🎖️ TSF Rütbe Ataması Başarılı')
                            .setThumbnail(sonuc.robloxUser.avatarUrl)
                            .addFields(
                                { name: '👤 Personel', value: `**${sonuc.robloxUser.username}**`, inline: true },
                                { name: '👮 Komutan', value: `${interaction.user}`, inline: true },
                                { name: '📉 Eski → 📈 Yeni', value: `\`${sonuc.eskiRolAdi}\` → **${sonuc.yeniRol.name}**` },
                                { name: '🎭 Discord Rol', value: sonuc.discordDurum },
                                { name: '📝 Sebep', value: sebep }
                            )]
                    });
                }
            }
        }

        // 3. TICKET AÇILIR MENÜSÜ
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_kategori_sec') {
            const ayar = sunucuAyarGetir(interaction.guildId);
            if (!ayar.moduller.ticket) return interaction.reply({ content: '❌ Ticket sistemi kapalı.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });

            const secilenId = interaction.values[0];
            const konuObj = (ayar.ticketKonular || []).find(k => k.id === secilenId) || { isim: 'Destek Talebi', emoji: '🎫', gorselUrl: '' };
            const kanalAdi = `bilet-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString().slice(-4)}`;

            const izinler = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ];
            if (ayar.ticketYetkiliRol) {
                izinler.push({ id: ayar.ticketYetkiliRol, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] });
            }

            const biletKanal = await interaction.guild.channels.create({
                name: kanalAdi,
                type: ChannelType.GuildText,
                parent: ayar.ticketKategori || null,
                topic: `Sahip: ${interaction.user.tag} (${interaction.user.id}) | Konu: ${konuObj.isim}`,
                permissionOverwrites: izinler
            });

            ayar.acikBiletler[biletKanal.id] = {
                id: crypto.randomUUID(),
                kanalId: biletKanal.id,
                kanalAdi: biletKanal.name,
                sahipId: interaction.user.id,
                sahipTag: interaction.user.tag,
                konu: konuObj.isim,
                ustlenenId: '',
                ustlenenTag: 'Atanmadı',
                acilisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            };
            dbKaydet();

            const embed = new EmbedBuilder()
                .setColor(ayar.ticketPanelRenk || '#3b82f6')
                .setTitle(`${konuObj.emoji || '🎫'} ${konuObj.isim}`)
                .setDescription(`Merhaba ${interaction.user}, destek talebiniz oluşturuldu.\n\n• **Kategori:** ${konuObj.isim}\n• **Açıklama:** ${konuObj.aciklama || 'Talebinizi detaylıca yazınız.'}`)
                .setTimestamp();
            const gorsel = (konuObj.gorselUrl || ayar.ticketPanelGorselUrl || '').trim();
            if (gorsel.startsWith('http')) embed.setImage(gorsel);

            const butonlar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_ustlen').setLabel('🙋 Talebi Üstlen').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_ai_ozet').setLabel('🤖 AI Özet').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_kapat').setLabel('🔒 Bileti Kapat & Değerlendir').setStyle(ButtonStyle.Danger)
            );

            const etiket = ayar.ticketYetkiliRol ? `${interaction.user} | <@&${ayar.ticketYetkiliRol}>` : `${interaction.user}`;
            await biletKanal.send({ content: etiket, embeds: [embed], components: [butonlar] });
            logEkle(interaction.guildId, 'TICKET', 'Bilet Açıldı', `#${biletKanal.name} (${konuObj.isim})`, interaction.user.tag);
            return interaction.editReply(`✅ Destek biletiniz açıldı: ${biletKanal}`);
        }

        // 4. BUTONLAR (SES ODASI PANELİ, TICKET, DEĞERLENDİRME, OPERASYON, YOKLAMA)
        if (interaction.isButton()) {
            const cid = interaction.customId;

            // METİN KANALINDAKİ "ÖZEL SES ODASI OLUŞTUR" PANEL BUTONU
            if (cid === 'ses_panel_acik_olustur' || cid === 'ses_panel_ozel_olustur') {
                const ayar = sunucuAyarGetir(interaction.guildId);
                if (!ayar.moduller.sesOdasi) return interaction.reply({ content: '❌ Özel ses odası sistemi şu an kapalı.', ephemeral: true });
                const ozelMi = cid === 'ses_panel_ozel_olustur';
                const modal = new ModalBuilder()
                    .setCustomId(`sesmodal_${ozelMi ? 'ozel' : 'acik'}`)
                    .setTitle(ozelMi ? '🔒 Özel / Kilitli Ses Odası Oluştur' : '🔊 Herkese Açık Ses Odası Oluştur');

                const isimInp = new TextInputBuilder()
                    .setCustomId('oda_isim')
                    .setLabel('Ses Odası İsmi')
                    .setPlaceholder('Örn: Tim-1 Operasyon Odası')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(40);

                const limitInp = new TextInputBuilder()
                    .setCustomId('oda_limit')
                    .setLabel('Kişi Limiti (0 = Sınırsız, 1-99 arası)')
                    .setPlaceholder('0')
                    .setValue('0')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(2);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(isimInp),
                    new ActionRowBuilder().addComponents(limitInp)
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
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#10b981').setDescription(`🙋 Bu destek talebi **${interaction.user}** tarafından üstlenildi.`)] });
            }

            if (cid === 'ticket_ai_ozet') {
                await interaction.deferReply();
                const mesajlar = await interaction.channel.messages.fetch({ limit: 30 });
                const dokum = Array.from(mesajlar.values()).reverse().filter(m => m.content).map(m => `${m.author.username}: ${m.content}`).join('\n');
                const ozet = await geminiSor('Destek konuşmasını 3-4 maddede kısa ve net özetle.', dokum || 'Mesaj yok.');
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#8b5cf6').setTitle('🤖 AI Bilet Özeti').setDescription(ozet)] });
            }

            if (cid === 'ticket_kapat') {
                await interaction.reply('🔒 Bilet kapatılıyor, sohbet arşivleniyor ve değerlendirme formu gönderiliyor...');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const acikBilgi = ayar.acikBiletler[interaction.channelId] || {};
                const mesajlar = await interaction.channel.messages.fetch({ limit: 100 });
                const sirali = Array.from(mesajlar.values()).reverse().map(m => ({
                    yazar: m.author.tag,
                    icerik: m.content || (m.attachments.size ? '[Görsel / Dosya]' : '[Embed]'),
                    ekler: Array.from(m.attachments.values()).map(a => a.url),
                    zaman: new Date(m.createdTimestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
                }));

                const ticketId = acikBilgi.id || crypto.randomUUID();
                const sahipId = acikBilgi.sahipId || (interaction.channel.topic?.match(/\((\d{17,20})\)/)?.[1] || '');
                const ustlenenTag = acikBilgi.ustlenenTag && acikBilgi.ustlenenTag !== 'Atanmadı' ? acikBilgi.ustlenenTag : interaction.user.tag;
                const ustlenenId = acikBilgi.ustlenenId || interaction.user.id;

                ayar.kapatilanBiletler.unshift({
                    id: ticketId,
                    kanalAdi: interaction.channel.name,
                    sahipId,
                    sahipTag: acikBilgi.sahipTag || 'Bilinmiyor',
                    konu: acikBilgi.konu || interaction.channel.topic || 'Destek Talebi',
                    ustlenenId,
                    ustlenenTag,
                    kapatan: interaction.user.tag,
                    kapanisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    mesajSayisi: sirali.length,
                    mesajlar: sirali,
                    puan: null,
                    yorum: ''
                });
                delete ayar.acikBiletler[interaction.channelId];
                if (ayar.kapatilanBiletler.length > 150) ayar.kapatilanBiletler.length = 150;
                logEkle(interaction.guildId, 'TICKET', 'Bilet Kapatıldı', `#${interaction.channel.name} (Yetkili: ${ustlenenTag})`, interaction.user.tag);

                if (sahipId) {
                    const sahipUser = await client.users.fetch(sahipId).catch(() => null);
                    if (sahipUser) {
                        const rateEmbed = new EmbedBuilder()
                            .setColor('#f59e0b')
                            .setTitle('⭐ Destek Bileti Değerlendirmesi')
                            .setDescription(`**#${interaction.channel.name}** destek biletiniz kapatıldı.\nİlgilenen Yetkili: **${ustlenenTag}**\n\nLütfen 1–5 yıldız arasında puan verin ve isterseniz yorum bırakın:`);
                        const yildizRow = new ActionRowBuilder().addComponents(
                            [1, 2, 3, 4, 5].map(n => new ButtonBuilder()
                                .setCustomId(`trate_${interaction.guildId}_${ticketId}_${n}`)
                                .setLabel(`${'⭐'.repeat(n)} (${n})`)
                                .setStyle(n >= 4 ? ButtonStyle.Success : (n === 3 ? ButtonStyle.Primary : ButtonStyle.Danger)))
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
                const puan = Number(puanStr);
                const ayar = sunucuAyarGetir(gId);
                const bilet = ayar.kapatilanBiletler.find(b => b.id === tId);
                if (!bilet) return interaction.reply({ content: '❌ Bilet kaydı bulunamadı.', ephemeral: true });
                bilet.puan = puan;
                dbKaydet();
                logEkle(gId, 'TICKET', 'Bilet Puanlandı', `#${bilet.kanalAdi}: ${puan} ★`, interaction.user.tag);
                return interaction.reply({ content: `✅ **${puan} ★** değerlendirmeniz kaydedildi!`, ephemeral: true });
            }

            if (cid.startsWith('tcomm_')) {
                const [, gId, tId] = cid.split('_');
                const modal = new ModalBuilder()
                    .setCustomId(`tmodal_${gId}_${tId}`)
                    .setTitle('📝 Yetkili & Bilet Değerlendirme Yorumu');
                const input = new TextInputBuilder()
                    .setCustomId('yorum_metni')
                    .setLabel('Yetkili ve destek süreci hakkındaki yorumunuz')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(400);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (cid.startsWith('op_')) {
                const [, durum, opId] = cid.split('_');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const op = (ayar.operasyonlar || []).find(o => o.id === opId);
                if (!op) return interaction.reply({ content: '❌ Operasyon kaydı bulunamadı.', ephemeral: true });

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
                    { name: `✅ Katılacaklar (${op.katilanlar.length})`, value: op.katilanlar.join(', ') || 'Henüz yok', inline: false },
                    { name: `❌ Mazeretliler (${op.mazeretliler.length})`, value: op.mazeretliler.join(', ') || 'Henüz yok', inline: false },
                    { name: `🕒 Belki (${op.belki.length})`, value: op.belki.join(', ') || 'Henüz yok', inline: false }
                );
                await interaction.message.edit({ embeds: [embed] });
                return interaction.reply({ content: '🫡 Operasyon katılım durumunuz güncellendi!', ephemeral: true });
            }

            if (cid === 'tsf_yoklama_katil') {
                const oldEmbed = interaction.message.embeds[0];
                if (!oldEmbed) return;
                const mevcut = oldEmbed.fields?.[0]?.value || '';
                const etiket = `<@${interaction.user.id}>`;
                if (mevcut.includes(etiket)) return interaction.reply({ content: '✅ Zaten yoklamadasınız.', ephemeral: true });
                const yeni = mevcut === 'Henüz katılım yok.' ? `• ${etiket}` : `${mevcut}\n• ${etiket}`;
                const embed = EmbedBuilder.from(oldEmbed).setFields({ name: `📋 Hazır Bulunan Personel (${yeni.split('\n').length} Kişi)`, value: yeni.slice(0, 1020) });
                await interaction.message.edit({ embeds: [embed] });
                return interaction.reply({ content: '🫡 Tekmiliniz alındı!', ephemeral: true });
            }
        }

        // 5. MODAL GÖNDERİMLERİ (SES ODASI PANEL MODALI & TICKET YORUM MODALI)
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('sesmodal_')) {
                const ozelMi = interaction.customId === 'sesmodal_ozel';
                const ayar = sunucuAyarGetir(interaction.guildId);
                const odaIsmi = interaction.fields.getTextInputValue('oda_isim').trim();
                const limitHam = parseInt(interaction.fields.getTextInputValue('oda_limit'), 10);
                const limit = isNaN(limitHam) ? 0 : Math.min(99, Math.max(0, limitHam));

                const permissionOverwrites = [];
                if (ozelMi) {
                    permissionOverwrites.push({ id: interaction.guild.id, deny: [PermissionsBitField.Flags.Connect] });
                    permissionOverwrites.push({
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers]
                    });
                }

                const oda = await interaction.guild.channels.create({
                    name: `${ozelMi ? '🔒' : '🔊'} ${odaIsmi}`,
                    type: ChannelType.GuildVoice,
                    parent: ayar.ozelSesKategori || null,
                    userLimit: limit,
                    permissionOverwrites
                });

                ayar.ozelSesOdalari[oda.id] = { sahipId: interaction.user.id, otomatikSil: true, olusturma: Date.now() };
                logEkle(interaction.guildId, 'SES', 'Panel Butonuyla Oda Oluşturuldu', `${oda.name} (Limit: ${limit || 'Sınırsız'})`, interaction.user.tag);
                return interaction.reply({
                    content: `✅ **${oda.name}** oluşturuldu: <#${oda.id}>\n*(Not: Oda boşaldığında sistem tarafından otomatik silinecektir. Özel odaysa kanal ayarlarından istediğiniz kişilere bağlanma izni verebilirsiniz.)*`,
                    ephemeral: true
                });
            }

            if (interaction.customId.startsWith('tmodal_')) {
                const [, gId, tId] = interaction.customId.split('_');
                const yorum = interaction.fields.getTextInputValue('yorum_metni').trim();
                const ayar = sunucuAyarGetir(gId);
                const bilet = ayar.kapatilanBiletler.find(b => b.id === tId);
                if (bilet) {
                    bilet.yorum = yorum;
                    dbKaydet();
                    logEkle(gId, 'TICKET', 'Bilet Yorumu Eklendi', `#${bilet.kanalAdi}: "${yorum.slice(0, 80)}"`, interaction.user.tag);
                }
                return interaction.reply({ content: '✅ Değerlendirme yorumunuz kaydedildi. Teşekkür ederiz!', ephemeral: true });
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
// 10. MESAJ OLAYLARI: GELİŞMİŞ AUTOMOD, AI, XP & PREFİX KOMUTLAR
// ============================================================================
const spamTakip = new Map();
const sonMesajTakip = new Map();
const xpCooldown = new Map();

async function automodCezaUygula(message, ayar, sebep) {
    await message.delete().catch(() => {});
    const aksiyon = ayar.automod.cezaAksiyonu || 'sil_uyar';
    const uyariMsg = await message.channel.send(`🛡️ ${message.author}, **${sebep}** nedeniyle mesajınız silindi.`);
    setTimeout(() => uyariMsg.delete().catch(() => {}), 4500);

    if (aksiyon === 'sil_uyar' || aksiyon === 'sil_timeout') {
        ayar.uyarilar.unshift({
            id: crypto.randomUUID(),
            kullaniciId: message.author.id,
            kullaniciTag: message.author.tag,
            yetkili: 'AutoMod',
            sebep: `Otomatik: ${sebep}`,
            tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
        const toplamUyari = ayar.uyarilar.filter(u => u.kullaniciId === message.author.id).length;
        const esik = Number(ayar.automod.otoCezaEsik) || 3;

        if (aksiyon === 'sil_timeout' || toplamUyari >= esik) {
            const dk = aksiyon === 'sil_timeout' ? (Number(ayar.automod.timeoutDakika) || 5) : (Number(ayar.automod.otoCezaTimeoutDakika) || 15);
            await message.member?.timeout(dk * 60 * 1000, `AutoMod: ${sebep}`).catch(() => {});
            logEkle(message.guild.id, 'AUTOMOD', `Otomatik Susturma (${dk} dk)`, `${message.author.tag} — ${sebep}`, 'AutoMod');
        } else {
            logEkle(message.guild.id, 'AUTOMOD', 'Otomatik Uyarı', `${message.author.tag} — ${sebep} (${toplamUyari}/${esik})`, 'AutoMod');
        }
    } else {
        logEkle(message.guild.id, 'AUTOMOD', 'Mesaj Silindi', `${message.author.tag} — ${sebep}`, 'AutoMod');
    }
}

client.on('messageCreate', async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        const ayar = sunucuAyarGetir(message.guild.id);
        const member = message.member;
        const yoneticiMi = member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // --- A. AUTOMOD ---
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
                    return automodCezaUygula(message, ayar, 'Tekrarlanan Mesaj (Duplicate Spam)');
                }
            }
            if (ayar.automod.kufurEngel && kufurKontrolEt(message.content, ayar.automod.yasakliKelimeler)) {
                return automodCezaUygula(message, ayar, 'Küfür / Yasaklı Kelime');
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
                const aiCevap = await geminiSor(ayar.aiSistemTalimati + ' Destek biletindesin, yetkili gelene kadar nazikçe ilk yönlendirmeyi yap.', message.content);
                await message.reply({ embeds: [new EmbedBuilder().setColor('#8b5cf6').setAuthor({ name: '🤖 AI Ön Destek' }).setDescription(aiCevap)] });
            }
        }

        // --- D. GELİŞMİŞ YAPAY ZEKA ---
        if (ayar.moduller.ai && ayar.aiAktif && message.mentions.has(client.user) && !message.mentions.everyone) {
            const izinliKanallar = ayar.aiIzinliKanallar || [];
            if (izinliKanallar.length > 0 && !izinliKanallar.includes(message.channel.id)) {
                const uyari = await message.reply(`🤖 Yapay zeka yalnızca izinli kanallarda aktiftir: ${izinliKanallar.map(id => `<#${id}>`).join(', ')}`);
                setTimeout(() => uyari.delete().catch(() => {}), 6000);
                return;
            }

            const soru = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            if (soru) {
                await message.channel.sendTyping();
                const baglamSayisi = Math.min(25, Math.max(1, Number(ayar.aiBaglamMesajSayisi) || 10));
                const sonMesajlar = await message.channel.messages.fetch({ limit: baglamSayisi });
                const baglamMetni = Array.from(sonMesajlar.values())
                    .reverse()
                    .map(m => `${m.member?.displayName || m.author.username}: ${m.content}`)
                    .join('\n');

                const soranBilgi = uyeRutbeVeKimlikAnaliz(message.guild, message.member, ayar);
                let hedefBilgileri = [];

                for (const [, mUser] of message.mentions.members) {
                    if (mUser.id === client.user.id) continue;
                    hedefBilgileri.push(uyeRutbeVeKimlikAnaliz(message.guild, mUser, ayar));
                }

                if (hedefBilgileri.length === 0 && /(kimdir|rütbesi|rutbesi|kim|sicil|rolü|rolu)/i.test(soru)) {
                    const kelimeler = soru.toLowerCase().split(/\s+/);
                    const bulunan = message.guild.members.cache.find(m =>
                        !m.user.bot && m.id !== message.author.id &&
                        kelimeler.some(k => k.length >= 3 && (m.displayName.toLowerCase().includes(k) || m.user.username.toLowerCase().includes(k)))
                    );
                    if (bulunan) hedefBilgileri.push(uyeRutbeVeKimlikAnaliz(message.guild, bulunan, ayar));
                }

                const kimlikBaglami = [
                    `[SORUYU SORAN PERSONEL]: ${soranBilgi.displayName} (@${soranBilgi.tag}) | Rütbe: ${soranBilgi.enYuksekRutbe} | Roller: ${soranBilgi.roller.join(', ') || 'Yok'} | Seviye: ${soranBilgi.seviye} | Nöbet: ${soranBilgi.nobetDakika} dk`,
                    ...hedefBilgileri.map(h => `[HEDEF PERSONEL]: ${h.displayName} (@${h.tag}) | Rütbe: ${h.enYuksekRutbe} | Roller: ${h.roller.join(', ') || 'Yok'} | Seviye: ${h.seviye} | Uyarı: ${h.uyariSayisi} | Nöbet: ${h.nobetDakika} dk`)
                ].join('\n');

                const tamPrompt = `${kimlikBaglami}\n\n[SOHBET BAĞLAMI (SON ${baglamSayisi} MESAJ)]:\n${baglamMetni}\n\n[SORU]:\n${soru}`;
                const yanit = await geminiSor(ayar.aiSistemTalimati + ' Verilen personel rütbe/rol bilgilerini kesin gerçek olarak kullan.', tamPrompt);
                logEkle(message.guild.id, 'AI', 'AI Yanıt Üretti', `#${message.channel.name}: ${soru.slice(0, 60)}`, message.author.tag);
                return message.reply(yanit.slice(0, 1990));
            }
        }

        // --- E. PREFİX KOMUTLAR ---
        const prefix = ayar.prefix || '!';
        if (!message.content.startsWith(prefix)) return;
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const komut = (args.shift() || '').toLowerCase();

        if (komut === 'ping') return message.reply(`🏓 Pong! **${client.ws.ping} ms**`);

        if (komut === 'yoklama') {
            if (!yoneticiMi && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ Yetkiniz yok.');
            const baslik = args.join(' ') || 'TSF Genel Aktiflik Yoklaması';
            const embed = new EmbedBuilder()
                .setColor('#f59e0b').setTitle(`🫡 ${baslik}`)
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
            logEkle(message.guild.id, 'MODERASYON', 'Toplu Mesaj Silindi', `#${message.channel.name} (${silinen.size})`, message.author.tag);
            return;
        }

        if (komut === 'uyar') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !yoneticiMi) return message.reply('❌ Yetkiniz yok.');
            const hedef = message.mentions.members.first();
            const sebep = args.slice(1).join(' ') || 'Disiplin ihlali';
            if (!hedef) return message.reply(`Kullanım: \`${prefix}uyar @kullanıcı <sebep>\``);
            ayar.uyarilar.unshift({
                id: crypto.randomUUID(), kullaniciId: hedef.id, kullaniciTag: hedef.user.tag,
                yetkili: message.author.tag, sebep, tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            });
            const toplam = ayar.uyarilar.filter(u => u.kullaniciId === hedef.id).length;
            const esik = Number(ayar.automod.otoCezaEsik) || 3;
            let ekstra = '';
            if (toplam >= esik) {
                const dk = Number(ayar.automod.otoCezaTimeoutDakika) || 15;
                await hedef.timeout(dk * 60 * 1000, `Uyarı eşiği (${toplam}/${esik})`).catch(() => {});
                ekstra = `\n🔇 Uyarı eşiği (${esik}) aşıldığı için **${dk} dakika** otomatik susturma uygulandı!`;
            }
            logEkle(message.guild.id, 'MODERASYON', 'Resmi Uyarı', `${hedef.user.tag}: ${sebep}`, message.author.tag);
            return message.reply(`⚠️ **${hedef.user.tag}** uyarıldı! (Toplam: **${toplam}**)\n📝 Sebep: ${sebep}${ekstra}`);
        }

        if (komut === 'ban' && message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            const hedef = message.mentions.members.first();
            if (!hedef) return message.reply(`Kullanım: \`${prefix}ban @kullanıcı <sebep>\``);
            const sebep = args.slice(1).join(' ') || 'Komuta kararı';
            await hedef.ban({ reason: sebep });
            logEkle(message.guild.id, 'MODERASYON', 'Ban', `${hedef.user.tag}: ${sebep}`, message.author.tag);
            return message.reply(`🔨 **${hedef.user.tag}** yasaklandı.`);
        }

        if (komut === 'kick' && message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            const hedef = message.mentions.members.first();
            if (!hedef) return message.reply(`Kullanım: \`${prefix}kick @kullanıcı <sebep>\``);
            const sebep = args.slice(1).join(' ') || 'Uzaklaştırıldı';
            await hedef.kick(sebep);
            logEkle(message.guild.id, 'MODERASYON', 'Kick', `${hedef.user.tag}: ${sebep}`, message.author.tag);
            return message.reply(`👢 **${hedef.user.tag}** atıldı.`);
        }
    } catch (err) {
        console.error('Mesaj işleme hatası:', err.message);
    }
});

// ============================================================================
// 11. SUNUCU OLAYLARI: YENİ HESAP KORUMASI, KARŞILAMA, NÖBET & ÖZEL ODA
// ============================================================================
const aktifNobetBaslangic = new Map();

client.on('guildMemberAdd', async (member) => {
    try {
        const ayar = sunucuAyarGetir(member.guild.id);

        // Yeni Hesap Koruması (Anti-Alt / Raid)
        const minGun = Number(ayar.automod?.yeniHesapKorumaGun) || 0;
        if (ayar.moduller.automod && minGun > 0) {
            const hesapYasiGun = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (hesapYasiGun < minGun) {
                await member.send(`🛡️ **${member.guild.name}** güvenlik politikası gereği hesabınızın en az **${minGun} günlük** olması gerekmektedir.`).catch(() => {});
                await member.kick(`Yeni hesap koruması (${Math.floor(hesapYasiGun)} gün < ${minGun} gün)`).catch(() => {});
                logEkle(member.guild.id, 'AUTOMOD', 'Yeni Hesap Engellendi', `${member.user.tag} (${Math.floor(hesapYasiGun)} günlük)`, 'AutoMod');
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
                const embed = new EmbedBuilder()
                    .setColor(ayar.girisRenk || '#10b981')
                    .setTitle(ayar.girisBaslik || '📥 Yeni Personel Katıldı!')
                    .setDescription(aciklama)
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                    .setTimestamp();
                if (ayar.girisArkaPlanUrl?.startsWith('http')) embed.setImage(ayar.girisArkaPlanUrl);
                await kanal.send({ embeds: [embed] }).catch(() => {});
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
                const embed = new EmbedBuilder()
                    .setColor(ayar.cikisRenk || '#ef4444')
                    .setTitle(ayar.cikisBaslik || '📤 Personel Ayrıldı')
                    .setDescription(aciklama)
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                    .setTimestamp();
                if (ayar.cikisArkaPlanUrl?.startsWith('http')) embed.setImage(ayar.cikisArkaPlanUrl);
                await kanal.send({ embeds: [embed] }).catch(() => {});
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
                await eskiKanal.delete('Özel ses odası boşaldığı için otomatik silindi').catch(() => {});
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
// 12. EXPRESS WEB SUNUCUSU VE TÜM API UÇ NOKTALARI
// ============================================================================
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/kayitlar', express.static(KAYITLAR_DIR));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function yetkiliOturumKontrol(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token || '');
    const oturum = sessions.get(token);
    if (!oturum) return res.status(401).json({ hata: 'Oturum geçersiz.' });
    req.oturum = oturum;
    next();
}

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

        sessions.set(panelToken, { id: user.id, username: user.global_name || user.username, avatar: avatarUrl, guilds: Array.isArray(guilds) ? guilds : [], isLocalAdmin: false });
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
    const uygun = req.oturum.isLocalAdmin ? botGuilds : botGuilds.filter(bg => {
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
        if (typeof b.puan === 'number') {
            yetkiliMap[y].puanToplam += b.puan;
            yetkiliMap[y].puanSayisi += 1;
        }
        if (b.yorum) yetkiliMap[y].yorumlar.push({ bilet: b.kanalAdi, puan: b.puan, yorum: b.yorum, tarih: b.kapanisTarihi });
    }
    const yetkiliKarnesi = Object.values(yetkiliMap).map(y => ({
        ...y,
        ortalama: y.puanSayisi ? Number((y.puanToplam / y.puanSayisi).toFixed(2)) : 0
    })).sort((a, b) => b.cozulmus - a.cozulmus);

    const terfiOnerileri = [];
    const hiyerarsi = ayarlar.tsfRutbeler || VARSAYILAN_TSF_RUTBELER;
    for (const [uid, xp] of Object.entries(ayarlar.leveling?.kullanicilar || {})) {
        const uye = guild.members.cache.get(uid);
        if (!uye || uye.user.bot) continue;
        const uyariSayisi = (ayarlar.uyarilar || []).filter(u => u.kullaniciId === uid).length;
        const nobetDk = Math.round((ayarlar.nobetSureleri?.[uid]?.toplamSaniye || 0) / 60);
        if (uyariSayisi === 0 && (xp.seviye >= 3 || nobetDk >= 60)) {
            const analiz = uyeRutbeVeKimlikAnaliz(guild, uye, ayarlar);
            const sonraki = (analiz.rutbeIndex >= 0 && analiz.rutbeIndex + 1 < hiyerarsi.length)
                ? hiyerarsi[analiz.rutbeIndex + 1].ad
                : hiyerarsi[0].ad;
            terfiOnerileri.push({
                userId: uid, username: uye.displayName, mevcutRutbe: analiz.enYuksekRutbe,
                onerilenRutbe: sonraki, seviye: xp.seviye, nobetDk
            });
        }
    }

    const uyeler = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, name: `${m.displayName} (@${m.user.username})` })).slice(0, 200);

    // Roblox rütbelerini otomatik yükle ki dropdown boş kalmasın
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
        ayarlar,
        robloxRoller,
        ticketIstatistik: {
            acikSayisi: acikListe.length,
            kapaliSayisi: kapatilan.length,
            toplamSayisi: acikListe.length + kapatilan.length,
            ortalamaPuan: ortPuan,
            memnuniyetOrani
        },
        acikBiletler: acikListe,
        yetkiliKarnesi,
        terfiOnerileri: terfiOnerileri.slice(0, 15),
        uyeler,
        metinKanallari: guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: '#' + c.name })),
        sesKanallari: guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).map(c => ({ id: c.id, name: '🔊 ' + c.name })),
        kategoriler: guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name })),
        roller: guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: '@' + r.name })),
        aktifSes: aktifOturum ? { aktif: true, kanalId: aktifOturum.kanalId, kanalAdi: aktifOturum.kanalAdi } : { aktif: false },
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
        leveling: yeniAyarlar.leveling ? { ...mevcut.leveling, ...yeniAyarlar.leveling } : mevcut.leveling
    };
    logEkle(guildId, 'PANEL', 'Ayarlar Güncellendi', aciklama || 'Panel yapılandırması', req.oturum.username);
    res.json({ basarili: true });
});

// METİN KANALINA "ÖZEL SES ODASI OLUŞTUR" PANELİ KUR
app.post('/api/ses-odasi/panel-kur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, kategoriId, baslik, aciklama, renk } = req.body;
        const guild = client.guilds.cache.get(guildId);
        const kanal = guild?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Hedef metin kanalı bulunamadı.' });

        const ayar = sunucuAyarGetir(guildId);
        if (kategoriId !== undefined) {
            ayar.ozelSesKategori = kategoriId;
            dbKaydet();
        }

        const embed = new EmbedBuilder()
            .setColor(renk || ayar.tema?.primary || '#3b82f6')
            .setTitle(baslik || '🎙️ Özel Ses Odası Oluşturma Merkezi')
            .setDescription(aciklama || 'Aşağıdaki butonları kullanarak kendinize veya ekibinize özel ses odası oluşturabilirsiniz.\n\n• **🔊 Herkese Açık Oda:** Tüm personelin katılabileceği ses odası açar.\n• **🔒 Özel / Kilitli Oda:** Sadece sizin yönetebileceğiniz kilitli ses odası açar.\n• *Oluşturulan odalar boşaldığında otomatik silinir.*')
            .setFooter({ text: 'ORDU YÖNETİMİ • Dinamik Ses Sistemi' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ses_panel_acik_olustur').setLabel('🔊 Herkese Açık Oda Oluştur').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ses_panel_ozel_olustur').setLabel('🔒 Özel / Kilitli Oda Oluştur').setStyle(ButtonStyle.Primary)
        );

        await kanal.send({ embeds: [embed], components: [row] });
        logEkle(guildId, 'SES', 'Ses Odası Paneli Kuruldu', `#${kanal.name}`, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) {
        res.status(500).json({ hata: err.message });
    }
});

// WEB PANELDEN DOĞRUDAN MODERASYON AKSİYONU (UYAR / SUSTUR / AT / YASAKLA)
app.post('/api/moderasyon/islem', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, userId, tur, sebep, dakika } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild || !userId) return res.status(400).json({ hata: 'Sunucu ve personel seçimi zorunludur.' });
        const ayar = sunucuAyarGetir(guildId);
        const member = await guild.members.fetch(userId).catch(() => null);
        const tag = member ? member.user.tag : userId;
        const temizSebep = sebep?.trim() || 'Komuta merkezi kararı';

        if (tur === 'uyar') {
            ayar.uyarilar.unshift({
                id: crypto.randomUUID(),
                kullaniciId: userId,
                kullaniciTag: tag,
                yetkili: `${req.oturum.username} (Panel)`,
                sebep: temizSebep,
                tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            });
            logEkle(guildId, 'MODERASYON', 'Panelden Resmi Uyarı', `${tag}: ${temizSebep}`, req.oturum.username);
            return res.json({ basarili: true, mesaj: `${tag} resmi olarak uyarıldı.` });
        }
        if (tur === 'sustur') {
            if (!member) return res.status(404).json({ hata: 'Üye sunucuda bulunamadı.' });
            const dk = Math.min(10080, Math.max(1, Number(dakika) || 10));
            await member.timeout(dk * 60 * 1000, temizSebep);
            logEkle(guildId, 'MODERASYON', `Panelden Susturma (${dk} dk)`, `${tag}: ${temizSebep}`, req.oturum.username);
            return res.json({ basarili: true, mesaj: `${tag} ${dk} dakika susturuldu.` });
        }
        if (tur === 'at') {
            if (!member) return res.status(404).json({ hata: 'Üye sunucuda bulunamadı.' });
            await member.kick(temizSebep);
            logEkle(guildId, 'MODERASYON', 'Panelden Atıldı (Kick)', `${tag}: ${temizSebep}`, req.oturum.username);
            return res.json({ basarili: true, mesaj: `${tag} sunucudan atıldı.` });
        }
        if (tur === 'yasakla') {
            await guild.members.ban(userId, { reason: temizSebep });
            logEkle(guildId, 'MODERASYON', 'Panelden Yasaklandı (Ban)', `${tag}: ${temizSebep}`, req.oturum.username);
            return res.json({ basarili: true, mesaj: `${tag} sunucudan yasaklandı.` });
        }
        res.status(400).json({ hata: 'Geçersiz moderasyon işlemi.' });
    } catch (err) {
        res.status(500).json({ hata: err.message });
    }
});

app.get('/api/ticket/acik/:guildId/:kanalId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const kanal = guild?.channels.cache.get(req.params.kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Bilet kanalı bulunamadı.' });
        const mesajlar = await kanal.messages.fetch({ limit: 80 });
        const sirali = Array.from(mesajlar.values()).reverse().map(m => ({
            yazar: m.author.tag,
            icerik: m.content || (m.attachments.size ? '[Görsel / Dosya]' : '[Embed]'),
            ekler: Array.from(m.attachments.values()).map(a => a.url),
            zaman: new Date(m.createdTimestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        }));
        res.json({ basarili: true, kanalAdi: kanal.name, mesajlar: sirali });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.get('/api/sicil/:guildId/:userId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const member = await guild?.members.fetch(req.params.userId).catch(() => null);
        if (!member) return res.status(404).json({ hata: 'Personel bulunamadı.' });
        const ayar = sunucuAyarGetir(guild.id);
        const analiz = uyeRutbeVeKimlikAnaliz(guild, member, ayar);
        const uyarilar = (ayar.uyarilar || []).filter(u => u.kullaniciId === member.id);
        res.json({
            basarili: true,
            avatar: member.user.displayAvatarURL({ size: 256 }),
            katilim: member.joinedAt ? member.joinedAt.toLocaleDateString('tr-TR') : '-',
            ...analiz,
            uyarilar
        });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/ses-odasi/olustur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, isim, limit, ozel, izinliUyeler, izinliRoller, otomatikSil } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild || !isim) return res.status(400).json({ hata: 'Sunucu ve oda ismi zorunludur.' });
        const ayar = sunucuAyarGetir(guildId);

        const permissionOverwrites = [];
        if (ozel) {
            permissionOverwrites.push({ id: guild.id, deny: [PermissionsBitField.Flags.Connect] });
            for (const uid of (izinliUyeler || [])) {
                if (uid) permissionOverwrites.push({ id: uid, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
            }
            for (const rid of (izinliRoller || [])) {
                if (rid) permissionOverwrites.push({ id: rid, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] });
            }
        }

        const oda = await guild.channels.create({
            name: `${ozel ? '🔒' : '🔊'} ${isim}`,
            type: ChannelType.GuildVoice,
            parent: ayar.ozelSesKategori || null,
            userLimit: Math.min(99, Math.max(0, Number(limit) || 0)),
            permissionOverwrites
        });

        ayar.ozelSesOdalari[oda.id] = { sahipId: req.oturum.id, otomatikSil: otomatikSil !== false, olusturma: Date.now() };
        logEkle(guildId, 'SES', 'Panelden Ses Odası Oluşturuldu', `${oda.name} (Limit: ${limit || 'Sınırsız'})`, req.oturum.username);
        res.json({ basarili: true, odaAdi: oda.name });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/ses-kayit/:id/tutanak', yetkiliOturumKontrol, async (req, res) => {
    try {
        const kayit = (db.sesKayitlari || []).find(k => k.id === req.params.id);
        if (!kayit) return res.status(404).json({ hata: 'Ses kaydı bulunamadı.' });
        const dosyaYolu = path.join(KAYITLAR_DIR, kayit.dosyaAdi);
        if (!fs.existsSync(dosyaYolu)) return res.status(404).json({ hata: 'WAV dosyası bulunamadı.' });

        const stats = fs.statSync(dosyaYolu);
        if (stats.size > 18 * 1024 * 1024) return res.status(400).json({ hata: 'Dosya 18 MB üzerinde.' });

        const base64Audio = fs.readFileSync(dosyaYolu).toString('base64');
        const tutanak = await geminiSor(
            'Sen askeri komuta toplantı sekreterisin. Ses kaydını analiz et ve 1) Toplantı Özeti, 2) Alınan Kararlar, 3) Görev Dağılımı başlıklarıyla Türkçe tutanak hazırla.',
            `Ses Kanalı: ${kayit.kanalAdi} (${kayit.tarih})`,
            [{ inlineData: { mimeType: 'audio/wav', data: base64Audio } }]
        );
        kayit.tutanak = tutanak;
        dbKaydet(true);
        res.json({ basarili: true, tutanak });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/loa/:guildId/:id/durum', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { durum } = req.body;
        const guild = client.guilds.cache.get(req.params.guildId);
        const ayar = sunucuAyarGetir(req.params.guildId);
        const loa = (ayar.loaTalepleri || []).find(l => l.id === req.params.id);
        if (!loa) return res.status(404).json({ hata: 'Talep bulunamadı.' });

        loa.durum = durum;
        loa.yetkili = req.oturum.username;

        if (durum === 'onaylandi' && guild) {
            loa.bitisTimestamp = Date.now() + (loa.gun * 24 * 60 * 60 * 1000);
            const member = await guild.members.fetch(loa.userId).catch(() => null);
            let rol = (ayar.izinliRolId && guild.roles.cache.get(ayar.izinliRolId))
                || guild.roles.cache.find(r => r.name.toLowerCase().includes('izinli'));
            if (!rol) {
                rol = await guild.roles.create({ name: '[İZİNLİ]', color: '#f59e0b', reason: 'LOA Sistemi' }).catch(() => null);
                if (rol) ayar.izinliRolId = rol.id;
            }
            if (member && rol) await member.roles.add(rol).catch(() => {});
        }
        logEkle(req.params.guildId, 'LOA', `İzin ${durum === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}`, `${loa.username} (${loa.gun} gün)`, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.post('/api/nobet/sifirla/:guildId', yetkiliOturumKontrol, (req, res) => {
    const ayar = sunucuAyarGetir(req.params.guildId);
    ayar.nobetSureleri = {};
    logEkle(req.params.guildId, 'SES', 'Haftalık Nöbet Sıfırlandı', 'Tüm personel ses nöbet süreleri sıfırlandı', req.oturum.username);
    res.json({ basarili: true });
});

app.post('/api/operasyon/olustur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, tarihSaat, aciklama, etiketle } = req.body;
        const kanal = client.guilds.cache.get(guildId)?.channels.cache.get(kanalId);
        if (!kanal || !baslik || !tarihSaat) return res.status(400).json({ hata: 'Kanal, başlık ve tarih/saat zorunludur.' });

        const ayar = sunucuAyarGetir(guildId);
        const opId = crypto.randomUUID().slice(0, 8);
        const embed = new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle(`🎯 OPERASYON / EĞİTİM: ${baslik}`)
            .setDescription(aciklama || 'Tüm personelin belirtilen saatte hazır bulunması gerekmektedir.')
            .addFields(
                { name: '📅 Tarih & Saat', value: tarihSaat, inline: true },
                { name: '✅ Katılacaklar (0)', value: 'Henüz yok', inline: false },
                { name: '❌ Mazeretliler (0)', value: 'Henüz yok', inline: false },
                { name: '🕒 Belki (0)', value: 'Henüz yok', inline: false }
            )
            .setFooter({ text: `Planlayan: ${req.oturum.username}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`op_katil_${opId}`).setLabel('✅ Katılacağım').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`op_mazeret_${opId}`).setLabel('❌ Mazeretliyim').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`op_belki_${opId}`).setLabel('🕒 Belki').setStyle(ButtonStyle.Secondary)
        );

        const msg = await kanal.send({ content: etiketle ? '@everyone' : undefined, embeds: [embed], components: [row] });
        ayar.operasyonlar.unshift({ id: opId, baslik, tarihSaat, aciklama, kanalId, mesajId: msg.id, olusturan: req.oturum.username, katilanlar: [], mazeretliler: [], belki: [] });
        logEkle(guildId, 'OPERASYON', 'Operasyon Planlandı', `${baslik} (${tarihSaat})`, req.oturum.username);
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
        const sonuc = await tamRutbeIslemiYap({ guild, robloxKullaniciAdi, hedefRolId, hedefDiscordMember: null, yetkiliEtiket: `${req.oturum.username} (Panel)` });
        res.json({ basarili: true, mesaj: `${sonuc.robloxUser.username}: ${sonuc.eskiRolAdi} → ${sonuc.yeniRol.name}` });
    } catch (err) { res.status(400).json({ hata: err.message }); }
});

app.post('/api/ai-test', yetkiliOturumKontrol, async (req, res) => {
    try {
        const ayar = sunucuAyarGetir(req.body.guildId);
        const yanit = await geminiSor(ayar.aiSistemTalimati, req.body.soru);
        res.json({ basarili: true, yanit });
    } catch (err) { res.status(500).json({ yanit: 'Hata: ' + err.message }); }
});

app.post('/api/ticket-kur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, aciklama, gorselUrl, renk } = req.body;
        const kanal = client.guilds.cache.get(guildId)?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });
        const ayar = sunucuAyarGetir(guildId);
        const konular = ayar.ticketKonular?.length ? ayar.ticketKonular : [{ id: 'genel', isim: 'Genel Destek', aciklama: 'Yardım', emoji: '🎫' }];

        const embed = new EmbedBuilder()
            .setColor(renk || ayar.ticketPanelRenk || '#3b82f6')
            .setTitle(baslik || '🎫 Destek Merkezi')
            .setDescription(aciklama || 'Kategori seçerek bilet açabilirsiniz.')
            .setTimestamp();
        if ((gorselUrl || ayar.ticketPanelGorselUrl || '').startsWith('http')) embed.setImage(gorselUrl || ayar.ticketPanelGorselUrl);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_kategori_sec')
            .setPlaceholder('📂 Destek Kategorisi Seçin...')
            .addOptions(konular.slice(0, 25).map(k => ({ label: k.isim.slice(0, 100), description: (k.aciklama || 'Destek').slice(0, 100), value: k.id, emoji: k.emoji || '🎫' })));

        await kanal.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
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
    logEkle(req.body.guildId, 'SES', 'Canlı Dinleme Durduruldu', sonuc?.dosyaAdi || 'Kayıtsız', req.oturum.username);
    res.json({ basarili: true, dosyaAdi: sonuc?.dosyaAdi || null });
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
        if (gorselUrl?.trim().startsWith('http')) embed.setImage(gorselUrl.trim());
        await kanal.send({ content: herkesiEtiketle ? '@everyone' : undefined, embeds: [embed] });
        logEkle(guildId, 'PANEL', 'Duyuru Yayınlandı', `#${kanal.name}`, req.oturum.username);
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
app.listen(PORT, () => console.log(`🚀 ORDU YÖNETİMİ v4.1 http://localhost:${PORT} adresinde hazır.`));
if (!DISCORD_TOKEN) console.error('❌ DISCORD_TOKEN eksik!');
else client.login(DISCORD_TOKEN).catch(err => console.error('❌ Bot Giriş Hatası:', err.message));