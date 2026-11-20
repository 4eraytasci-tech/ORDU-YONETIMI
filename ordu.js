// ============================================================================
// ORDU YÖNETİMİ (TSF) — KOMUTA & KONTROL BOTU + WEB PANEL SUNUCUSU (ordu.js)
// ============================================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

process.on('unhandledRejection', (err) => {
    console.error('⚠️ Ağ / Promise Uyarısı (Bot kapanmadan devam ediyor):', err?.message || err);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Beklenmeyen Sistem Uyarısı (Bot kapanmadan devam ediyor):', err?.message || err);
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
    ChannelType,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    AuditLogEvent
} = require('discord.js');

// Opsiyonel Ses Modülü (@discordjs/voice) — yüklü değilse bot çökmeden devam eder
let VoiceLib = null;
try {
    VoiceLib = require('@discordjs/voice');
} catch (_) {
    console.warn('ℹ️ @discordjs/voice yüklü değil; canlı ses dinleme devre dışı, diğer tüm sistemler aktif.');
}

// Opsiyonel Proxy Desteği (.env içinde HTTPS_PROXY varsa aktif olur)
try {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        const { ProxyAgent, setGlobalDispatcher } = require('undici');
        setGlobalDispatcher(new ProxyAgent(proxyUrl));
        console.log('🌐 Proxy yönlendirmesi aktif:', proxyUrl);
    }
} catch (_) {}

// ============================================================================
// 1. YAPILANDIRMA VE DOSYA YOLLARI
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

// ============================================================================
// 2. TÜRKÇE SÖZLÜK VE AKILLI KÜFÜR FİLTRESİ YÜKLEYİCİ
// ============================================================================
function turkceNormalize(metin) {
    return String(metin || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/@/g, 'a')
        .replace(/\$/g, 's');
}

const yasakliSet = new Set();
const sozlukSet = new Set();

if (fs.existsSync(KUFURLER_PATH)) {
    const satirlar = fs.readFileSync(KUFURLER_PATH, 'utf8').split(/\r?\n/);
    for (const s of satirlar) {
        const temiz = s.trim().toLocaleLowerCase('tr-TR');
        if (temiz.length >= 2) yasakliSet.add(temiz);
    }
    console.log(`🛡️ kufurler.txt yüklendi: ${yasakliSet.size} yasaklı kelime aktif.`);
}

if (fs.existsSync(KELIMELER_PATH)) {
    const satirlar = fs.readFileSync(KELIMELER_PATH, 'utf8').split(/\r?\n/);
    for (const s of satirlar) {
        const temiz = s.trim().toLocaleLowerCase('tr-TR');
        if (temiz.length >= 2) sozlukSet.add(temiz);
    }
    console.log(`📚 kelimeler.txt yüklendi: ${sozlukSet.size} sözlük kelimesi tanımlandı.`);
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
        // Eğer kelime temiz Türkçe sözlükte varsa ve doğrudan ağır küfür listesinde değilse yanlış pozitif verme
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
// 3. KALICI VERİTABANI VE OTURUM YÖNETİMİ
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

function dbKaydet(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Veritabanı yazma hatası:', e.message);
    }
}

let db = dbYukle();

function sunucuAyarGetir(guildId) {
    if (!db.sunucular[guildId]) {
        db.sunucular[guildId] = {};
    }
    const s = db.sunucular[guildId];
    const varsayilan = {
        prefix: '!',
        robloxGrupId: DEFAULT_ROBLOX_GROUP_ID,
        rutbeYetkiliRol: '',
        rutbeOtoIsim: false,
        aiAktif: true,
        aiSistemTalimati: 'Sen ORDU YÖNETİMİ (TSF) sunucusunun disiplinli, saygılı, stratejik düşünen ve Türkçeye tam uyumlu Komuta Yapay Zeka Asistanısın. Kullanıcılara rütbe bilincine uygun saygılı ve net yanıtlar ver.',
        ticketKategori: '',
        ticketYetkiliRol: '',
        ticketAiAktif: true,
        ticketPanelGorselUrl: '',
        ticketKonular: [
            { id: 'rutbe_talebi', isim: 'Rütbe & Terfi Talebi', aciklama: 'TSF Roblox ve Discord rütbe eşitleme işlemleri', emoji: '🎖️', gorselUrl: '' },
            { id: 'sikayet_bildirim', isim: 'Disiplin & Şikayet Bildirimi', aciklama: 'Kural ihlali veya personel şikayetleri', emoji: '⚖️', gorselUrl: '' },
            { id: 'genel_destek', isim: 'Genel Komuta Desteği', aciklama: 'Sunucu ve operasyon hakkında sorularınız', emoji: '🎫', gorselUrl: '' }
        ],
        kapatilanBiletler: [],
        automod: {
            kufurEngel: true,
            linkEngel: false,
            capsEngel: false,
            spamEngel: true,
            muafRol: '',
            yasakliKelimeler: []
        },
        sesLogKanal: '',
        rolLogKanal: '',
        mesajLogKanal: '',
        girisCikisLogKanal: '',
        otoRol: '',
        girisArkaPlanUrl: 'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?auto=format&fit=crop&w=1200&q=80',
        cikisArkaPlanUrl: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80',
        leveling: {
            aktif: true,
            seviyeKanal: '',
            xpCarpan: 1,
            kullanicilar: {}
        },
        uyarilar: [],
        logs: []
    };

    db.sunucular[guildId] = {
        ...varsayilan,
        ...s,
        automod: { ...varsayilan.automod, ...(s.automod || {}) },
        leveling: { ...varsayilan.leveling, ...(s.leveling || {}) }
    };
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
    if (ayar.logs.length > 250) ayar.logs.length = 250;
    dbKaydet(db);
}

// Kalıcı Oturum Deposu (Sunucu yeniden başlasa bile kullanıcı çıkış yapmaz)
let sessions = new Map();
try {
    if (fs.existsSync(SESSIONS_PATH)) {
        const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
        sessions = new Map(Object.entries(raw));
    }
} catch (_) {}

function sessionKaydet() {
    try {
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8');
    } catch (_) {}
}

// ============================================================================
// 4. YENİDEN DENEMELİ GÜVENLİ HTTP İSTEK YARDIMCISI
// ============================================================================
async function guvenliFetch(url, options = {}, deneme = 3) {
    let sonHata = null;
    for (let i = 1; i <= deneme; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return res;
        } catch (err) {
            sonHata = err;
            if (i < deneme) {
                await new Promise(r => setTimeout(r, 700 * i));
            }
        }
    }
    throw sonHata || new Error('Ağ bağlantısı başarısız.');
}

// ============================================================================
// 5. ROBLOX TSF RÜTBE MOTORU (OPEN CLOUD V2 + .ROBLOSECURITY ÇİFT MOTOR)
// ============================================================================
const robloxRolCache = new Map(); // groupId -> { zaman, roller }

async function robloxGrupRolleriniGetir(groupId, zorlaYenile = false) {
    const gId = String(groupId || DEFAULT_ROBLOX_GROUP_ID).trim();
    const cached = robloxRolCache.get(gId);
    if (!zorlaYenile && cached && Date.now() - cached.zaman < 60_000) {
        return cached.roller;
    }

    let roller = [];

    // 1. Yöntem: Roblox Open Cloud v2 API
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
                        rank: Number(r.rank || 0),
                        memberCount: r.memberCount ?? null
                    }));
                }
            }
        } catch (e) {
            console.warn('Open Cloud rol listesi uyarısı:', e.message);
        }
    }

    // 2. Yöntem (Yedek veya Ana): Public Roblox Groups v1 API
    if (roller.length === 0) {
        const res = await guvenliFetch(`https://groups.roblox.com/v1/groups/${gId}/roles`);
        if (!res.ok) {
            throw new Error(`Roblox grup rolleri alınamadı (HTTP ${res.status}). Grup ID (${gId}) kontrol edin.`);
        }
        const data = await res.json();
        roller = (data.roles || []).map(r => ({
            id: String(r.id),
            path: `groups/${gId}/roles/${r.id}`,
            name: r.name,
            rank: Number(r.rank || 0),
            memberCount: r.memberCount ?? null
        }));
    }

    roller.sort((a, b) => a.rank - b.rank);
    robloxRolCache.set(gId, { zaman: Date.now(), roller });
    return roller;
}

async function robloxKullaniciBul(kullaniciAdi) {
    const temizAd = String(kullaniciAdi || '').trim();
    if (!temizAd) throw new Error('Roblox kullanıcı adı boş olamaz.');

    const res = await guvenliFetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [temizAd], excludeBannedUsers: false })
    });

    if (!res.ok) {
        throw new Error(`Roblox kullanıcı arama servisi yanıt vermedi (HTTP ${res.status}).`);
    }
    const data = await res.json();
    const u = data?.data?.[0];
    if (!u || !u.id) {
        throw new Error(`"${temizAd}" adında bir Roblox kullanıcısı bulunamadı.`);
    }

    let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${u.id}&width=150&height=150&format=png`;
    try {
        const thumbRes = await guvenliFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${u.id}&size=150x150&format=Png&isCircular=false`);
        if (thumbRes.ok) {
            const tData = await thumbRes.json();
            if (tData?.data?.[0]?.imageUrl) avatarUrl = tData.data[0].imageUrl;
        }
    } catch (_) {}

    return {
        id: String(u.id),
        username: u.name,
        displayName: u.displayName || u.name,
        avatarUrl
    };
}

async function robloxKullaniciGrupBilgisi(groupId, userId) {
    const res = await guvenliFetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    if (!res.ok) return null;
    const data = await res.json();
    const kayit = (data.data || []).find(g => String(g.group?.id) === String(groupId));
    if (!kayit) return null;
    return {
        roleId: String(kayit.role.id),
        roleName: kayit.role.name,
        rank: Number(kayit.role.rank)
    };
}

async function robloxCsrfTokenAl() {
    if (!ROBLOX_COOKIE) throw new Error('ROBLOX_COOKIE tanımlı değil.');
    const res = await guvenliFetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: {
            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
            'Content-Type': 'application/json'
        }
    });
    const token = res.headers.get('x-csrf-token');
    if (!token) {
        throw new Error('Roblox CSRF token alınamadı. .ROBLOSECURITY çerezi süresi dolmuş olabilir.');
    }
    return token;
}

async function robloxGrupRutbeDegistir(groupId, userId, hedefRol) {
    const gId = String(groupId).trim();
    const uId = String(userId).trim();
    let openCloudHata = null;

    // 1. ÖNCELİK: ROBLOX OPEN CLOUD V2 API
    if (ROBLOX_API_KEY) {
        try {
            const filterExpr = encodeURIComponent(`user=='users/${uId}'`);
            const listRes = await guvenliFetch(`https://apis.roblox.com/cloud/v2/groups/${gId}/memberships?maxPageSize=10&filter=${filterExpr}`, {
                headers: { 'x-api-key': ROBLOX_API_KEY }
            });

            if (!listRes.ok) {
                const errTxt = await listRes.text();
                throw new Error(`Open Cloud üyelik sorgusu başarısız (HTTP ${listRes.status}): ${errTxt}`);
            }

            const listData = await listRes.json();
            const uyelik = listData?.groupMemberships?.[0];
            if (!uyelik || !uyelik.path) {
                throw new Error('Kullanıcı bu Roblox grubuna üye değil! Önce gruba katılmalıdır.');
            }

            const hedefRolYolu = hedefRol.path || `groups/${gId}/roles/${hedefRol.id}`;
            const patchRes = await guvenliFetch(`https://apis.roblox.com/cloud/v2/${uyelik.path}`, {
                method: 'PATCH',
                headers: {
                    'x-api-key': ROBLOX_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: hedefRolYolu })
            });

            if (!patchRes.ok) {
                const errJson = await patchRes.json().catch(() => ({}));
                const detay = errJson.message || JSON.stringify(errJson);
                throw new Error(`Open Cloud rütbe atama reddedildi (HTTP ${patchRes.status}): ${detay}`);
            }

            return { basarili: true, yontem: 'Open Cloud v2' };
        } catch (err) {
            openCloudHata = err.message;
            console.warn('⚠️ Open Cloud rütbe hatası, Cookie yedeği deneniyor:', openCloudHata);
        }
    }

    // 2. YEDEK / ALTERNATİF: ROBLOX LEGACY API + .ROBLOSECURITY COOKIE
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
            const msg = errJson?.errors?.[0]?.message || `HTTP ${patchRes.status}`;
            throw new Error(`Roblox rütbe değiştirilemedi: ${msg}`);
        }

        return { basarili: true, yontem: 'Cookie Auth' };
    }

    throw new Error(openCloudHata || 'Ne ROBLOX_API_KEY ne de ROBLOX_COOKIE çalışmadı. .env dosyasındaki anahtarları kontrol edin.');
}

// ============================================================================
// 6. YAPAY ZEKA (GEMINI AI) VE AKILLI DİSCORD ROL EŞLEŞTİRME MOTORU
// ============================================================================
async function geminiSor(sistemTalimati, kullaniciMesaji) {
    if (!GEMINI_API_KEY) {
        return '⚠️ GEMINI_API_KEY .env dosyasında tanımlı değil.';
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const body = {
        systemInstruction: { parts: [{ text: sistemTalimati || 'Yardımcı bir asistansın.' }] },
        contents: [{ role: 'user', parts: [{ text: kullaniciMesaji }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 900 }
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

async function discordRutbeRoluBulVeEslestir(guild, robloxRutbeAdi, tumRobloxRolleri) {
    const sunucuRolleri = Array.from(guild.roles.cache.values())
        .filter(r => !r.managed && r.id !== guild.id);

    const temiz = (s) => turkceNormalize(s).replace(/[^a-z0-9]/g, '');
    const hedefTemiz = temiz(robloxRutbeAdi);

    // 1. Aşama: Askeri Kod Eşleşmesi ([OF-4], [OR-5], [WO-2], [CW-1] vb.)
    const kodEslesme = robloxRutbeAdi.match(/\b(OF|OR|WO|CW|O|E)[\s\-_]?(\d{1,2})\b/i);
    if (kodEslesme) {
        const kodTam = (kodEslesme[1] + kodEslesme[2]).toLowerCase(); // örn: of4
        const rol = sunucuRolleri.find(r => {
            const rt = temiz(r.name);
            return rt === kodTam || rt.startsWith(kodTam) || rt.endsWith(kodTam) || new RegExp(`\\b${kodEslesme[1]}[\\s\\-_]?${kodEslesme[2]}\\b`, 'i').test(r.name);
        });
        if (rol) return rol;
    }

    // 2. Aşama: Doğrudan İsim Eşleşmesi ([OF-4] Binbaşı -> @Binbaşı)
    const parantezSonrasi = robloxRutbeAdi.replace(/^\[[^\]]+\]\s*/, '').trim();
    const parantezTemiz = temiz(parantezSonrasi);
    if (parantezTemiz.length >= 2) {
        const isimRol = sunucuRolleri.find(r => {
            const rt = temiz(r.name);
            return rt === parantezTemiz || rt === hedefTemiz || (parantezTemiz.length >= 4 && rt.includes(parantezTemiz));
        });
        if (isimRol) return isimRol;
    }

    // 3. Aşama: Gemini AI Semantik Eşleştirme
    if (GEMINI_API_KEY && sunucuRolleri.length > 0) {
        try {
            const rolListesiMetin = sunucuRolleri.map(r => `${r.id}: ${r.name}`).join('\n');
            const cevap = await geminiSor(
                'Sen bir Discord ve Roblox askeri rütbe eşleştirme motorusun. Verilen Roblox rütbesine karşılık gelen Discord rolünün SADECE sayısal ID numarasını döndür. Hiçbir eşleşme yoksa SADECE "YOK" yaz.',
                `Roblox Rütbesi: "${robloxRutbeAdi}"\n\nSunucudaki Discord Rolleri:\n${rolListesiMetin}`
            );
            const idMatch = cevap.match(/\b\d{17,20}\b/);
            if (idMatch) {
                const aiRol = guild.roles.cache.get(idMatch[0]);
                if (aiRol) return aiRol;
            }
        } catch (_) {}
    }

    return null;
}

async function discordUyeRutbeSenkronizeEt(guild, member, yeniRobloxRol, tumRobloxRolleri) {
    if (!member) return { durum: 'Discord üyesi sunucuda bulunamadı.' };

    const eslesenRol = await discordRutbeRoluBulVeEslestir(guild, yeniRobloxRol.name, tumRobloxRolleri);
    if (!eslesenRol) {
        return { durum: `"${yeniRobloxRol.name}" rütbesine karşılık Discord rolü bulunamadı.` };
    }

    // Sunucudaki diğer rütbe rollerini tespit edip temizle
    const digerRutbeRolIdleri = new Set();
    for (const rRol of tumRobloxRolleri) {
        if (rRol.id === yeniRobloxRol.id) continue;
        const dRol = await discordRutbeRoluBulVeEslestir(guild, rRol.name, []);
        if (dRol && dRol.id !== eslesenRol.id && member.roles.cache.has(dRol.id)) {
            digerRutbeRolIdleri.add(dRol.id);
        }
    }

    try {
        if (digerRutbeRolIdleri.size > 0) {
            await member.roles.remove(Array.from(digerRutbeRolIdleri)).catch(() => {});
        }
        if (!member.roles.cache.has(eslesenRol.id)) {
            await member.roles.add(eslesenRol);
        }
        return { durum: `<@&${eslesenRol.id}> rolü başarıyla verildi!`, rol: eslesenRol };
    } catch (err) {
        return { durum: `Rol verilemedi (Bot rolünü "${eslesenRol.name}" rolünün üstüne taşıyın): ${err.message}` };
    }
}

// Ortak Rütbe İşlemi Fonksiyonu (Hem Slash Komut, Hem Prefix Komut, Hem Web Panel kullanır)
async function tamRutbeIslemiYap({ guild, robloxKullaniciAdi, hedefRolId, hedefDiscordMember, yetkiliEtiket }) {
    const ayar = sunucuAyarGetir(guild.id);
    const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;

    const [robloxUser, tumRoller] = await Promise.all([
        robloxKullaniciBul(robloxKullaniciAdi),
        robloxGrupRolleriniGetir(groupId)
    ]);

    const hedefRol = tumRoller.find(r => String(r.id) === String(hedefRolId))
        || tumRoller.find(r => r.name.toLowerCase().includes(String(hedefRolId).toLowerCase()));

    if (!hedefRol) {
        throw new Error(`"${hedefRolId}" rütbesi TSF grubunda (${groupId}) bulunamadı.`);
    }
    if (hedefRol.rank === 0 || hedefRol.rank === 255) {
        throw new Error(`"${hedefRol.name}" (Rank ${hedefRol.rank}) sistem tarafından atanamaz.`);
    }

    const mevcutGrupBilgi = await robloxKullaniciGrupBilgisi(groupId, robloxUser.id);
    if (!mevcutGrupBilgi) {
        throw new Error(`**${robloxUser.username}** adlı oyuncu TSF Roblox grubuna (${groupId}) üye değil!`);
    }

    const eskiRolAdi = mevcutGrupBilgi.roleName;
    const sonuc = await robloxGrupRutbeDegistir(groupId, robloxUser.id, hedefRol);

    // Discord üyesini bul (belirtilmediyse sunucu takma adından veya kullanıcı adından ara)
    let uye = hedefDiscordMember;
    if (!uye) {
        await guild.members.fetch().catch(() => {});
        const aranan = robloxUser.username.toLowerCase();
        uye = guild.members.cache.find(m =>
            m.user.username.toLowerCase() === aranan ||
            (m.nickname && m.nickname.toLowerCase().includes(aranan)) ||
            m.displayName.toLowerCase().includes(aranan)
        ) || null;
    }

    const discordSonuc = await discordUyeRutbeSenkronizeEt(guild, uye, hedefRol, tumRoller);

    logEkle(
        guild.id,
        'ROBLOX',
        'Rütbe Ataması',
        `${robloxUser.username}: ${eskiRolAdi} → ${hedefRol.name} | Discord: ${uye ? uye.user.tag : 'Eşleşmedi'}`,
        yetkiliEtiket
    );

    return {
        robloxUser,
        eskiRolAdi,
        yeniRol: hedefRol,
        yontem: sonuc.yontem,
        discordUye: uye,
        discordDurum: discordSonuc.durum
    };
}

// ============================================================================
// 7. CANLI SES DİNLEME VE 48KHZ STEREO WAV KAYIT MOTORU
// ============================================================================
const aktifSesOturumlari = new Map(); // guildId -> { kanalId, kanalAdi, connection, streamClients: Set, kayitYap, pcmChunks: [], baslangic }

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
        try {
            res.write(satir);
        } catch (_) {
            oturum.streamClients.delete(res);
        }
    }
}

async function sesDinlemeBaslat(guild, kanalId, kayitYap = true) {
    if (!VoiceLib) {
        throw new Error('Sunucuda @discordjs/voice paketi kurulu değil.');
    }
    if (aktifSesOturumlari.has(guild.id)) {
        await sesDinlemeDurdur(guild.id);
    }

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

    const oturum = {
        kanalId: kanal.id,
        kanalAdi: kanal.name,
        connection,
        streamClients: new Set(),
        kayitYap: !!kayitYap,
        pcmChunks: [],
        baslangic: Date.now(),
        dinlenenKullanicilar: new Set()
    };

    aktifSesOturumlari.set(guild.id, oturum);

    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
        const uye = guild.members.cache.get(userId);
        const ad = uye ? uye.displayName : userId;
        sseGonder(oturum, { type: 'speaking', userId, kullaniciAdi: ad, durum: true });

        if (oturum.dinlenenKullanicilar.has(userId)) return;
        oturum.dinlenenKullanicilar.add(userId);

        try {
            const opusStream = receiver.subscribe(userId, {
                end: { behavior: VoiceLib.EndBehaviorType.AfterSilence, duration: 1000 }
            });

            let prism = null;
            try { prism = require('prism-media'); } catch (_) {}

            if (prism) {
                const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
                opusStream.pipe(decoder);

                decoder.on('data', (pcm) => {
                    if (oturum.kayitYap) oturum.pcmChunks.push(pcm);
                    if (oturum.streamClients.size > 0) {
                        sseGonder(oturum, { type: 'audio', userId, pcm: pcm.toString('base64') });
                    }
                });

                decoder.on('end', () => oturum.dinlenenKullanicilar.delete(userId));
                decoder.on('error', () => oturum.dinlenenKullanicilar.delete(userId));
            } else {
                opusStream.on('end', () => oturum.dinlenenKullanicilar.delete(userId));
            }
        } catch (_) {
            oturum.dinlenenKullanicilar.delete(userId);
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
            tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
        dbKaydet(db);
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
                .setDescription('Bir üyeye TSF Roblox grubunda ve Discord sunucusunda rütbe verir')
                .addStringOption(opt => opt.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true))
                .addStringOption(opt => opt.setName('rutbe').setDescription('Verilecek TSF rütbesi').setRequired(true).setAutocomplete(true))
                .addUserOption(opt => opt.setName('discord_uye').setDescription('Eşleştirilecek Discord üyesi (opsiyonel)').setRequired(false))
                .addStringOption(opt => opt.setName('sebep').setDescription('Terfi / atama sebebi').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('sorgula')
                .setDescription('Oyuncunun TSF Roblox rütbesini sorgular')
                .addStringOption(opt => opt.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('senkronize')
                .setDescription('Üyenin Discord rolünü mevcut TSF Roblox rütbesiyle eşitler')
                .addUserOption(opt => opt.setName('discord_uye').setDescription('Discord üyesi').setRequired(true))
                .addStringOption(opt => opt.setName('roblox_kullanici').setDescription('Roblox adı (boşsa Discord adından aranır)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('liste')
                .setDescription('TSF Roblox grubundaki tüm rütbeleri listeler')
        ),
    new SlashCommandBuilder()
        .setName('yardim')
        .setDescription('ORDU YÖNETİMİ botunun tüm komutlarını ve özelliklerini gösterir'),
    new SlashCommandBuilder()
        .setName('kimlik')
        .setDescription('Askeri personel kimlik kartını ve seviye/rütbe bilgilerini gösterir')
        .addUserOption(opt => opt.setName('uye').setDescription('Görüntülenecek üye').setRequired(false))
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
        console.log('⚡ Slash komutları (/rütbe, /yardim, /kimlik) başarıyla kaydedildi.');
    } catch (err) {
        console.error('⚠️ Slash komut kayıt uyarısı:', err.message);
    }
}

client.once('ready', async () => {
    console.log(`👑 ORDU YÖNETİMİ (KİNG) Bot Aktif: ${client.user.tag}`);
    client.user.setActivity('TSF Komuta Ağı | /rütbe ver', { type: 3 });
    await slashKomutlariKaydet();

    try {
        const roller = await robloxGrupRolleriniGetir(DEFAULT_ROBLOX_GROUP_ID);
        console.log(`🎖️ TSF Roblox Grubu (${DEFAULT_ROBLOX_GROUP_ID}) yüklendi: ${roller.length} rütbe tanımlı.`);
    } catch (e) {
        console.warn('⚠️ TSF Roblox başlangıç rütbe yükleme uyarısı:', e.message);
    }
});

client.on('error', (err) => console.error('⚠️ Discord Client Hatası:', err?.message || err));

// ============================================================================
// 9. SLASH KOMUT, AUTOCOMPLETE, TICKET MENÜ VE BUTON ETKİLEŞİMLERİ
// ============================================================================
client.on('interactionCreate', async (interaction) => {
    try {
        // 1. AUTOCOMPLETE (/rütbe ver -> rutbe)
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'rütbe') {
                const aranan = interaction.options.getFocused().toLowerCase();
                const ayar = sunucuAyarGetir(interaction.guildId);
                const roller = await robloxGrupRolleriniGetir(ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID).catch(() => []);
                const filtrelenmis = roller
                    .filter(r => r.rank > 0 && r.rank < 255 && r.name.toLowerCase().includes(aranan))
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
                    .setColor('#3b82f6')
                    .setTitle('🎖️ ORDU YÖNETİMİ — Komuta & Yönetim Rehberi')
                    .setDescription('Sunucunuzdaki aktif tüm askeri, moderasyon ve yapay zeka sistemleri:')
                    .addFields(
                        {
                            name: '🎖️ TSF Roblox & Rütbe Komutları',
                            value: '`/rütbe ver` — Roblox & Discord rütbesi verir\n`/rütbe sorgula` — Oyuncunun TSF rütbesini sorgular\n`/rütbe senkronize` — Discord rolünü Roblox ile eşitler\n`/rütbe liste` — Grup rütbelerini listeler'
                        },
                        {
                            name: '⚖️ Moderasyon Komutları (`' + ayar.prefix + '`)',
                            value: `\`${ayar.prefix}ban\`, \`${ayar.prefix}kick\`, \`${ayar.prefix}sustur\`, \`${ayar.prefix}uyar\`, \`${ayar.prefix}uyarilar\`, \`${ayar.prefix}sil\`, \`${ayar.prefix}kilit\`, \`${ayar.prefix}yavasmod\``
                        },
                        {
                            name: '🤖 Yapay Zeka & Operasyon',
                            value: `@${client.user.username} <mesaj> — AI Komuta Asistanı\n\`${ayar.prefix}yoklama\` — İnteraktif TSF aktiflik yoklaması\n\`${ayar.prefix}oylama\` — Canlı butonlu oylama başlatır\n\`/kimlik\` — Personel sicil ve seviye kartı`
                        }
                    )
                    .setFooter({ text: 'ORDU YÖNETİMİ • Web Panel: http://localhost:' + PORT });
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'kimlik') {
                const hedef = interaction.options.getUser('uye') || interaction.user;
                const uye = await interaction.guild.members.fetch(hedef.id).catch(() => null);
                const xpBilgi = ayar.leveling?.kullanicilar?.[hedef.id] || { seviye: 1, xp: 0 };
                const uyariSayisi = (ayar.uyarilar || []).filter(u => u.kullaniciId === hedef.id).length;

                const embed = new EmbedBuilder()
                    .setColor('#10b981')
                    .setTitle(`🪪 Personel Sicil & Kimlik Kartı`)
                    .setThumbnail(hedef.displayAvatarURL({ size: 256 }))
                    .addFields(
                        { name: '👤 Personel', value: `${hedef} (\`${hedef.tag}\`)`, inline: true },
                        { name: '🏆 Seviye & XP', value: `Seviye **${xpBilgi.seviye}** (${xpBilgi.xp} XP)`, inline: true },
                        { name: '⚠️ Sicil Uyarı', value: `${uyariSayisi} Kayıt`, inline: true },
                        { name: '📅 Katılım Tarihi', value: uye ? `<t:${Math.floor(uye.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor', inline: true },
                        { name: '🎖️ Aktif Roller', value: uye ? (uye.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).slice(0, 10).join(', ') || 'Rol yok') : '-' }
                    );
                return interaction.reply({ embeds: [embed] });
            }

            if (interaction.commandName === 'rütbe') {
                await interaction.deferReply();
                const alt = interaction.options.getSubcommand();
                const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;

                if (alt === 'liste') {
                    const roller = await robloxGrupRolleriniGetir(groupId, true);
                    const metin = roller
                        .filter(r => r.rank > 0)
                        .map(r => `\`[${r.rank}]\` **${r.name}**`)
                        .join('\n') || 'Rütbe bulunamadı.';

                    const embed = new EmbedBuilder()
                        .setColor('#f59e0b')
                        .setTitle(`🎖️ TSF Roblox Grubu (${groupId}) Rütbe Hiyerarşisi`)
                        .setDescription(metin.slice(0, 4000));
                    return interaction.editReply({ embeds: [embed] });
                }

                if (alt === 'sorgula') {
                    const kAdi = interaction.options.getString('kullanici');
                    const rUser = await robloxKullaniciBul(kAdi);
                    const bilgi = await robloxKullaniciGrupBilgisi(groupId, rUser.id);

                    const embed = new EmbedBuilder()
                        .setColor('#3b82f6')
                        .setTitle(`🔍 TSF Personel Sorgu — ${rUser.username}`)
                        .setThumbnail(rUser.avatarUrl)
                        .addFields(
                            { name: 'Roblox ID', value: `\`${rUser.id}\``, inline: true },
                            { name: 'Mevcut Grup Rütbesi', value: bilgi ? `**${bilgi.roleName}** (Rank ${bilgi.rank})` : '❌ TSF Grubuna Üye Değil', inline: true }
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

                // Yetki Kontrolü (ver ve senkronize için)
                const yoneticiMi = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
                    || interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles);
                const yetkiliRolVarMi = ayar.rutbeYetkiliRol && interaction.member.roles.cache.has(ayar.rutbeYetkiliRol);

                if (!yoneticiMi && !yetkiliRolVarMi) {
                    return interaction.editReply('❌ Bu komutu kullanmak için **Yönetici** veya panelden tanımlanan **Rütbe Yetkili Rolü**ne sahip olmalısınız.');
                }

                if (alt === 'senkronize') {
                    const dUser = interaction.options.getUser('discord_uye');
                    const dMember = await interaction.guild.members.fetch(dUser.id);
                    const rAdi = interaction.options.getString('roblox_kullanici') || dMember.displayName.replace(/^\[[^\]]+\]\s*/, '');
                    const rUser = await robloxKullaniciBul(rAdi);
                    const bilgi = await robloxKullaniciGrupBilgisi(groupId, rUser.id);
                    if (!bilgi) {
                        return interaction.editReply(`❌ **${rUser.username}** TSF Roblox grubuna üye değil.`);
                    }
                    const tumRoller = await robloxGrupRolleriniGetir(groupId);
                    const hedefRol = tumRoller.find(r => r.id === bilgi.roleId) || { id: bilgi.roleId, name: bilgi.roleName, rank: bilgi.rank };
                    const senk = await discordUyeRutbeSenkronizeEt(interaction.guild, dMember, hedefRol, tumRoller);

                    const embed = new EmbedBuilder()
                        .setColor('#10b981')
                        .setTitle('🔄 TSF Rütbe Senkronizasyonu Tamamlandı')
                        .setThumbnail(rUser.avatarUrl)
                        .addFields(
                            { name: 'Roblox Hesabı', value: `**${rUser.username}**`, inline: true },
                            { name: 'Grup Rütbesi', value: `**${bilgi.roleName}**`, inline: true },
                            { name: 'Discord Durumu', value: senk.durum }
                        );
                    return interaction.editReply({ embeds: [embed] });
                }

                if (alt === 'ver') {
                    const kAdi = interaction.options.getString('kullanici');
                    const hedefRolId = interaction.options.getString('rutbe');
                    const dUser = interaction.options.getUser('discord_uye');
                    const sebep = interaction.options.getString('sebep') || 'Komuta kararı ile terfi / atama';
                    const dMember = dUser ? await interaction.guild.members.fetch(dUser.id).catch(() => null) : null;

                    const sonuc = await tamRutbeIslemiYap({
                        guild: interaction.guild,
                        robloxKullaniciAdi: kAdi,
                        hedefRolId,
                        hedefDiscordMember: dMember,
                        yetkiliEtiket: interaction.user.tag
                    });

                    const embed = new EmbedBuilder()
                        .setColor('#10b981')
                        .setTitle('🎖️ TSF Rütbe Ataması Başarıyla Gerçekleşti')
                        .setThumbnail(sonuc.robloxUser.avatarUrl)
                        .addFields(
                            { name: '👤 Personel (Roblox)', value: `**${sonuc.robloxUser.username}** (\`${sonuc.robloxUser.id}\`)`, inline: true },
                            { name: '👮 İşlemi Yapan Komutan', value: `${interaction.user}`, inline: true },
                            { name: '📉 Eski Rütbe', value: `\`${sonuc.eskiRolAdi}\``, inline: true },
                            { name: '📈 Yeni Rütbe', value: `**${sonuc.yeniRol.name}**`, inline: true },
                            { name: '🎭 Discord Rol Eşleşmesi', value: sonuc.discordDurum },
                            { name: '📝 Sebep', value: sebep }
                        )
                        .setFooter({ text: `ORDU YÖNETİMİ • API Motoru: ${sonuc.yontem}` })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                }
            }
        }

        // 3. TICKET AÇILIR MENÜSÜ
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_kategori_sec') {
            await interaction.deferReply({ ephemeral: true });
            const ayar = sunucuAyarGetir(interaction.guildId);
            const secilenId = interaction.values[0];
            const konuObj = (ayar.ticketKonular || []).find(k => k.id === secilenId) || {
                isim: 'Destek Talebi',
                emoji: '🎫',
                gorselUrl: ''
            };

            const kanalAdi = `bilet-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}-${Date.now().toString().slice(-4)}`;
            const izinler = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ];
            if (ayar.ticketYetkiliRol) {
                izinler.push({
                    id: ayar.ticketYetkiliRol,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }

            const biletKanal = await interaction.guild.channels.create({
                name: kanalAdi,
                type: ChannelType.GuildText,
                parent: ayar.ticketKategori || null,
                topic: `Sahip: ${interaction.user.tag} (${interaction.user.id}) | Konu: ${konuObj.isim}`,
                permissionOverwrites: izinler
            });

            const embed = new EmbedBuilder()
                .setColor('#3b82f6')
                .setTitle(`${konuObj.emoji || '🎫'} ${konuObj.isim}`)
                .setDescription(`Merhaba ${interaction.user}, destek talebiniz başarıyla oluşturuldu.\n\n• **Kategori:** ${konuObj.isim}\n• **Açıklama:** ${konuObj.aciklama || 'Lütfen talebinizi detaylıca yazın ve varsa ekran görüntüsü ekleyin.'}\n\nYetkili komutanlarımız en kısa sürede ilgilenecektir.`)
                .setTimestamp();

            // Kategoriye özel görsel veya genel ticket görseli varsa embed içine yerleştir
            const biletGorsel = (konuObj.gorselUrl || ayar.ticketPanelGorselUrl || '').trim();
            if (biletGorsel && biletGorsel.startsWith('http')) {
                embed.setImage(biletGorsel);
            }

            const butonlar = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_ustlen').setLabel('🙋 Talebi Üstlen').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_ai_ozet').setLabel('🤖 AI Özet Çıkar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_kapat').setLabel('🔒 Bileti Kapat & Arşivle').setStyle(ButtonStyle.Danger)
            );

            const etiketMetni = ayar.ticketYetkiliRol ? `${interaction.user} | <@&${ayar.ticketYetkiliRol}>` : `${interaction.user}`;
            await biletKanal.send({ content: etiketMetni, embeds: [embed], components: [butonlar] });

            logEkle(interaction.guildId, 'TICKET', 'Bilet Açıldı', `#${biletKanal.name} (${konuObj.isim})`, interaction.user.tag);
            return interaction.editReply(`✅ Destek biletiniz açıldı: ${biletKanal}`);
        }

        // 4. BUTON ETKİLEŞİMLERİ (TICKET & YOKLAMA & OYLAMA)
        if (interaction.isButton()) {
            if (interaction.customId === 'ticket_ustlen') {
                const embed = new EmbedBuilder()
                    .setColor('#10b981')
                    .setDescription(`🙋 Bu destek talebi **${interaction.user}** tarafından devralındı.`);
                return interaction.reply({ embeds: [embed] });
            }

            if (interaction.customId === 'ticket_ai_ozet') {
                await interaction.deferReply();
                const mesajlar = await interaction.channel.messages.fetch({ limit: 30 });
                const dokum = Array.from(mesajlar.values())
                    .reverse()
                    .filter(m => m.content)
                    .map(m => `${m.author.username}: ${m.content}`)
                    .join('\n');
                const ozet = await geminiSor(
                    'Sen bir destek bileti özetleyicisisin. Verilen destek konuşmasını komutanlar için 3-4 maddede kısa ve net özetle.',
                    dokum || 'Henüz mesaj yok.'
                );
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#8b5cf6').setTitle('🤖 Yapay Zeka Bilet Özeti').setDescription(ozet)]
                });
            }

            if (interaction.customId === 'ticket_kapat') {
                await interaction.reply('🔒 Bilet kapatılıyor, tüm mesajlar ve görseller arşivleniyor...');
                const ayar = sunucuAyarGetir(interaction.guildId);
                const mesajlar = await interaction.channel.messages.fetch({ limit: 100 });
                const sirali = Array.from(mesajlar.values()).reverse().map(m => {
                    const ekUrlList = Array.from(m.attachments.values()).map(a => a.url);
                    return {
                        yazar: m.author.tag,
                        icerik: m.content || (ekUrlList.length ? '[Görsel / Dosya Eki]' : '[Embed]'),
                        ekler: ekUrlList,
                        zaman: new Date(m.createdTimestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
                    };
                });

                ayar.kapatilanBiletler.unshift({
                    id: crypto.randomUUID(),
                    kanalAdi: interaction.channel.name,
                    konu: interaction.channel.topic || 'Destek Talebi',
                    kapatan: interaction.user.tag,
                    kapanisTarihi: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                    mesajSayisi: sirali.length,
                    mesajlar: sirali
                });
                if (ayar.kapatilanBiletler.length > 100) ayar.kapatilanBiletler.length = 100;

                logEkle(interaction.guildId, 'TICKET', 'Bilet Kapatıldı', `#${interaction.channel.name} (${sirali.length} mesaj arşivlendi)`, interaction.user.tag);
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3500);
                return;
            }

            if (interaction.customId === 'tsf_yoklama_katil') {
                const msg = interaction.message;
                const oldEmbed = msg.embeds[0];
                if (!oldEmbed) return;
                const mevcutAlan = oldEmbed.fields?.[0]?.value || '';
                const etiket = `<@${interaction.user.id}>`;
                if (mevcutAlan.includes(etiket)) {
                    return interaction.reply({ content: '✅ Yoklamada zaten kaydınız bulunuyor!', ephemeral: true });
                }
                const yeniListe = mevcutAlan === 'Henüz katılım yok.' ? `• ${etiket}` : `${mevcutAlan}\n• ${etiket}`;
                const sayi = yeniListe.split('\n').length;
                const yeniEmbed = EmbedBuilder.from(oldEmbed).setFields({
                    name: `📋 Hazır Bulunan Personel (${sayi} Kişi)`,
                    value: yeniListe.slice(0, 1020)
                });
                await msg.edit({ embeds: [yeniEmbed] });
                return interaction.reply({ content: '🫡 Yoklama kaydınız alındı!', ephemeral: true });
            }
        }
    } catch (err) {
        console.error('Interaction Hatası:', err);
        const hataMesaji = `❌ İşlem Başarısız: ${err.message}`;
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: hataMesaji }).catch(() => {});
        } else if (interaction.isRepliable()) {
            await interaction.reply({ content: hataMesaji, ephemeral: true }).catch(() => {});
        }
    }
});

// ============================================================================
// 10. MESAJ OLAYLARI: AUTOMOD, AI SOHBET, TICKET AI, XP VE PREFİX KOMUTLAR
// ============================================================================
const spamTakip = new Map(); // userId -> [timestamps]
const xpCooldown = new Map();

client.on('messageCreate', async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        const ayar = sunucuAyarGetir(message.guild.id);
        const member = message.member;

        // --- A. AUTOMOD KORUMASI ---
        const yoneticiMi = member?.permissions.has(PermissionsBitField.Flags.Administrator);
        const muafMi = yoneticiMi || (ayar.automod?.muafRol && member?.roles.cache.has(ayar.automod.muafRol));

        if (!muafMi) {
            // 1. Spam Koruması
            if (ayar.automod?.spamEngel) {
                const simdi = Date.now();
                const gecmis = (spamTakip.get(message.author.id) || []).filter(t => simdi - t < 4500);
                gecmis.push(simdi);
                spamTakip.set(message.author.id, gecmis);
                if (gecmis.length >= 5) {
                    await message.delete().catch(() => {});
                    logEkle(message.guild.id, 'AUTOMOD', 'Spam Engellendi', `#${message.channel.name}`, message.author.tag);
                    return;
                }
            }

            // 2. Küfür Filtresi
            if (ayar.automod?.kufurEngel) {
                const yakalanan = kufurKontrolEt(message.content, ayar.automod.yasakliKelimeler);
                if (yakalanan) {
                    await message.delete().catch(() => {});
                    const uyariMsg = await message.channel.send(`🛡️ ${message.author}, sunucu kurallarına aykırı kelime tespit edildi ve mesajınız silindi.`);
                    setTimeout(() => uyariMsg.delete().catch(() => {}), 4000);
                    logEkle(message.guild.id, 'AUTOMOD', 'Küfür Engellendi', `Kanal: #${message.channel.name}`, message.author.tag);
                    return;
                }
            }

            // 3. Link / Davet Engeli
            if (ayar.automod?.linkEngel && /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)/i.test(message.content)) {
                await message.delete().catch(() => {});
                const uyariMsg = await message.channel.send(`🔗 ${message.author}, bu kanalda bağlantı paylaşımına izin verilmiyor.`);
                setTimeout(() => uyariMsg.delete().catch(() => {}), 4000);
                logEkle(message.guild.id, 'AUTOMOD', 'Link Engellendi', `Kanal: #${message.channel.name}`, message.author.tag);
                return;
            }

            // 4. Büyük Harf (CAPS) Engeli
            if (ayar.automod?.capsEngel && message.content.length >= 12) {
                const harfler = message.content.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g, '');
                const buyukler = harfler.replace(/[^A-ZĞÜŞİÖÇ]/g, '');
                if (harfler.length >= 10 && buyukler.length / harfler.length > 0.75) {
                    await message.delete().catch(() => {});
                    const uyariMsg = await message.channel.send(`🔠 ${message.author}, lütfen tamamı büyük harflerden oluşan mesajlar göndermeyin.`);
                    setTimeout(() => uyariMsg.delete().catch(() => {}), 4000);
                    return;
                }
            }
        }

        // --- B. SEVİYE & XP SİSTEMİ ---
        if (ayar.leveling?.aktif) {
            const sonXp = xpCooldown.get(message.author.id) || 0;
            if (Date.now() - sonXp > 15000) {
                xpCooldown.set(message.author.id, Date.now());
                const carpan = Number(ayar.leveling.xpCarpan) || 1;
                const kazanilan = Math.round((Math.floor(Math.random() * 11) + 10) * carpan);
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
                    hedefKanal.send(`🎖️ Tebrikler ${message.author}! Aktifliğinizle **Seviye ${uData.seviye}** rütbesine ulaştınız!`).catch(() => {});
                }
                dbKaydet(db);
            }
        }

        // --- C. TİCKET İÇİ AI ÖN DESTEK ---
        if (message.channel.name.startsWith('bilet-') && ayar.ticketAiAktif && !message.content.startsWith(ayar.prefix)) {
            const mesajlar = await message.channel.messages.fetch({ limit: 8 });
            const yetkiliYazmisMi = mesajlar.some(m => !m.author.bot && m.author.id !== message.author.id);
            if (!yetkiliYazmisMi && mesajlar.size <= 4) {
                await message.channel.sendTyping();
                const aiCevap = await geminiSor(
                    ayar.aiSistemTalimati + ' Şu an bir destek biletindesin. Yetkili komutan gelene kadar kullanıcıya nazikçe yardımcı ol ve eksik bilgi varsa sor.',
                    message.content
                );
                await message.reply({
                    embeds: [new EmbedBuilder().setColor('#8b5cf6').setAuthor({ name: '🤖 AI Ön Destek Asistanı' }).setDescription(aiCevap)]
                });
            }
        }

        // --- D. BOT ETİKETLENİNCE AI SOHBET ---
        if (ayar.aiAktif && message.mentions.has(client.user) && !message.mentions.everyone) {
            const soru = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            if (soru) {
                await message.channel.sendTyping();
                const yanit = await geminiSor(ayar.aiSistemTalimati, `Kullanıcı (${message.member?.displayName || message.author.username}): ${soru}`);
                await message.reply(yanit.slice(0, 1990));
                return;
            }
        }

        // --- E. PREFİX KOMUTLAR (!uyar, !ban, !kick, !sil, !yoklama, !oylama, !rütbe vb.) ---
        const prefix = ayar.prefix || '!';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const komut = (args.shift() || '').toLowerCase();

        if (komut === 'ping') {
            return message.reply(`🏓 Pong! Bot Gecikmesi: **${client.ws.ping} ms**`);
        }

        if (komut === 'yoklama' || komut === 'aktiflik') {
            if (!yoneticiMi && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return message.reply('❌ Yoklama başlatmak için yetkiniz yok.');
            }
            const baslik = args.join(' ') || 'TSF Genel Aktiflik & Hazır Kıta Yoklaması';
            const embed = new EmbedBuilder()
                .setColor('#f59e0b')
                .setTitle(`🫡 ${baslik}`)
                .setDescription(`Komutan **${message.author}** tarafından yoklama başlatıldı.\nGörevde olan tüm personel aşağıdaki butona tıklayarak tekmil vermelidir!`)
                .addFields({ name: '📋 Hazır Bulunan Personel (0 Kişi)', value: 'Henüz katılım yok.' })
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tsf_yoklama_katil').setLabel('🫡 Buradayım / Görevdeyim').setStyle(ButtonStyle.Success)
            );
            return message.channel.send({ embeds: [embed], components: [row] });
        }

        if (komut === 'oylama') {
            const soru = args.join(' ');
            if (!soru) return message.reply(`Kullanım: \`${prefix}oylama <Oylama konusu>\``);
            const embed = new EmbedBuilder()
                .setColor('#3b82f6')
                .setTitle('📊 Komuta Oylaması')
                .setDescription(soru)
                .setFooter({ text: `Başlatan: ${message.author.tag}` })
                .setTimestamp();
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('✅').catch(() => {});
            await msg.react('❌').catch(() => {});
            return;
        }

        if (komut === 'sil' || komut === 'temizle') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return message.reply('❌ Mesaj silme yetkiniz yok.');
            }
            const adet = Math.min(100, Math.max(1, parseInt(args[0], 10) || 0));
            if (!adet) return message.reply(`Kullanım: \`${prefix}sil <1-100>\``);
            await message.delete().catch(() => {});
            const silinen = await message.channel.bulkDelete(adet, true);
            const info = await message.channel.send(`🧹 **${silinen.size}** adet mesaj temizlendi.`);
            setTimeout(() => info.delete().catch(() => {}), 3500);
            logEkle(message.guild.id, 'MODERASYON', 'Toplu Mesaj Silindi', `#${message.channel.name} (${silinen.size} mesaj)`, message.author.tag);
            return;
        }

        if (komut === 'uyar') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !yoneticiMi) {
                return message.reply('❌ Uyarı vermek için yetkiniz yok.');
            }
            const hedef = message.mentions.members.first();
            const sebep = args.slice(1).join(' ') || 'Disiplin kurallarına aykırı davranış';
            if (!hedef) return message.reply(`Kullanım: \`${prefix}uyar @kullanıcı <sebep>\``);

            ayar.uyarilar.unshift({
                id: crypto.randomUUID(),
                kullaniciId: hedef.id,
                kullaniciTag: hedef.user.tag,
                yetkili: message.author.tag,
                sebep,
                tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
            });
            logEkle(message.guild.id, 'MODERASYON', 'Resmi Uyarı', `${hedef.user.tag}: ${sebep}`, message.author.tag);

            const toplamUyari = ayar.uyarilar.filter(u => u.kullaniciId === hedef.id).length;
            return message.reply(`⚠️ **${hedef.user.tag}** resmi olarak uyarıldı! (Toplam Uyarı: **${toplamUyari}**)\n📝 **Sebep:** ${sebep}`);
        }

        if (komut === 'ban') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return message.reply('❌ Yasaklama yetkiniz yok.');
            }
            const hedef = message.mentions.members.first();
            const sebep = args.slice(1).join(' ') || 'Komuta kararı ile yasaklandı';
            if (!hedef) return message.reply(`Kullanım: \`${prefix}ban @kullanıcı <sebep>\``);
            await hedef.ban({ reason: sebep });
            logEkle(message.guild.id, 'MODERASYON', 'Sunucudan Yasaklandı (Ban)', `${hedef.user.tag}: ${sebep}`, message.author.tag);
            return message.reply(`🔨 **${hedef.user.tag}** sunucudan yasaklandı. Sebep: ${sebep}`);
        }

        if (komut === 'kick') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return message.reply('❌ Atma yetkiniz yok.');
            }
            const hedef = message.mentions.members.first();
            const sebep = args.slice(1).join(' ') || 'Sunucudan uzaklaştırıldı';
            if (!hedef) return message.reply(`Kullanım: \`${prefix}kick @kullanıcı <sebep>\``);
            await hedef.kick(sebep);
            logEkle(message.guild.id, 'MODERASYON', 'Sunucudan Atıldı (Kick)', `${hedef.user.tag}: ${sebep}`, message.author.tag);
            return message.reply(`👢 **${hedef.user.tag}** sunucudan atıldı. Sebep: ${sebep}`);
        }

        if (komut === 'kilit' || komut === 'kilitle') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
            return message.reply('🔒 Kanal mesaj gönderimine kilitlendi.');
        }

        if (komut === 'kilit-ac') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
            return message.reply('🔓 Kanal kilidi kaldırıldı.');
        }

        if (komut === 'rütbe' || komut === 'rutbe') {
            const alt = (args[0] || '').toLowerCase();
            if (alt === 'ver') {
                const yonetici = yoneticiMi || message.member.permissions.has(PermissionsBitField.Flags.ManageRoles);
                const yetkiliRol = ayar.rutbeYetkiliRol && message.member.roles.cache.has(ayar.rutbeYetkiliRol);
                if (!yonetici && !yetkiliRol) return message.reply('❌ Rütbe verme yetkiniz yok.');

                const kAdi = args[1];
                const rutbeAdi = args.slice(2).join(' ');
                if (!kAdi || !rutbeAdi) {
                    return message.reply(`Kullanım: \`${prefix}rütbe ver <RobloxKullanıcıAdı> <RütbeAdı>\` veya \`/rütbe ver\``);
                }
                const bekle = await message.reply('⏳ TSF Roblox ve Discord rütbe senkronizasyonu işleniyor...');
                try {
                    const sonuc = await tamRutbeIslemiYap({
                        guild: message.guild,
                        robloxKullaniciAdi: kAdi,
                        hedefRolId: rutbeAdi,
                        hedefDiscordMember: message.mentions.members.first() || null,
                        yetkiliEtiket: message.author.tag
                    });
                    return bekle.edit(`✅ **${sonuc.robloxUser.username}** oyuncusunun rütbesi \`${sonuc.eskiRolAdi}\` → **${sonuc.yeniRol.name}** olarak güncellendi!\n🎭 Discord: ${sonuc.discordDurum}`);
                } catch (e) {
                    return bekle.edit(`❌ Rütbe Verme Başarısız: ${e.message}`);
                }
            }
        }
    } catch (err) {
        console.error('Mesaj işleme hatası:', err.message);
    }
});

// ============================================================================
// 11. SUNUCU LOG OLAYLARI (GİRİŞ-ÇIKIŞ KARTLARI, SES, ROL, MESAJ LOG)
// ============================================================================
client.on('guildMemberAdd', async (member) => {
    try {
        const ayar = sunucuAyarGetir(member.guild.id);
        logEkle(member.guild.id, 'UYE', 'Sunucuya Katıldı', `Toplam Üye: ${member.guild.memberCount}`, member.user.tag);

        if (ayar.otoRol) {
            const rol = member.guild.roles.cache.get(ayar.otoRol);
            if (rol) await member.roles.add(rol).catch(() => {});
        }

        if (ayar.girisCikisLogKanal) {
            const kanal = member.guild.channels.cache.get(ayar.girisCikisLogKanal);
            if (kanal) {
                const embed = new EmbedBuilder()
                    .setColor('#10b981')
                    .setTitle('📥 Yeni Personel Katıldı!')
                    .setDescription(`Hoş geldin ${member} (**${member.user.tag}**)\nSunucumuz seninle birlikte **${member.guild.memberCount}** kişiye ulaştı!`)
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                    .setTimestamp();
                if (ayar.girisArkaPlanUrl && ayar.girisArkaPlanUrl.startsWith('http')) {
                    embed.setImage(ayar.girisArkaPlanUrl);
                }
                await kanal.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } catch (_) {}
});

client.on('guildMemberRemove', async (member) => {
    try {
        const ayar = sunucuAyarGetir(member.guild.id);
        logEkle(member.guild.id, 'UYE', 'Sunucudan Ayrıldı', `Kalan Üye: ${member.guild.memberCount}`, member.user.tag);

        if (ayar.girisCikisLogKanal) {
            const kanal = member.guild.channels.cache.get(ayar.girisCikisLogKanal);
            if (kanal) {
                const embed = new EmbedBuilder()
                    .setColor('#ef4444')
                    .setTitle('📤 Personel Ayrıldı')
                    .setDescription(`**${member.user.tag}** sunucudan ayrıldı.\nKalan üye sayısı: **${member.guild.memberCount}**`)
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                    .setTimestamp();
                if (ayar.cikisArkaPlanUrl && ayar.cikisArkaPlanUrl.startsWith('http')) {
                    embed.setImage(ayar.cikisArkaPlanUrl);
                }
                await kanal.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } catch (_) {}
});

client.on('voiceStateUpdate', (oldState, newState) => {
    try {
        const guild = newState.guild || oldState.guild;
        const ayar = sunucuAyarGetir(guild.id);
        const uye = newState.member || oldState.member;
        if (!uye || uye.user.bot) return;

        let detay = '';
        if (!oldState.channelId && newState.channelId) {
            detay = `🔊 **${newState.channel.name}** ses kanalına katıldı.`;
        } else if (oldState.channelId && !newState.channelId) {
            detay = `🔇 **${oldState.channel.name}** ses kanalından ayrıldı.`;
        } else if (oldState.channelId !== newState.channelId) {
            detay = `🔀 **${oldState.channel.name}** → **${newState.channel.name}** kanalına geçti.`;
        } else {
            return;
        }

        logEkle(guild.id, 'SES', 'Ses Kanalı Hareketi', detay.replace(/\*\*/g, ''), uye.user.tag);
        if (ayar.sesLogKanal) {
            const k = guild.channels.cache.get(ayar.sesLogKanal);
            if (k) {
                k.send({
                    embeds: [new EmbedBuilder().setColor('#8b5cf6').setAuthor({ name: uye.user.tag, iconURL: uye.user.displayAvatarURL() }).setDescription(detay).setTimestamp()]
                }).catch(() => {});
            }
        }
    } catch (_) {}
});

client.on('messageDelete', (message) => {
    try {
        if (!message.guild || message.author?.bot || !message.content) return;
        const ayar = sunucuAyarGetir(message.guild.id);
        logEkle(message.guild.id, 'MESAJ', 'Mesaj Silindi', `#${message.channel.name}: ${message.content.slice(0, 120)}`, message.author.tag);
        if (ayar.mesajLogKanal) {
            const k = message.guild.channels.cache.get(ayar.mesajLogKanal);
            if (k) {
                k.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#ef4444')
                            .setTitle('🗑️ Mesaj Silindi')
                            .addFields(
                                { name: 'Yazar', value: `${message.author} (\`${message.author.tag}\`)`, inline: true },
                                { name: 'Kanal', value: `${message.channel}`, inline: true },
                                { name: 'İçerik', value: message.content.slice(0, 1000) }
                            )
                            .setTimestamp()
                    ]
                }).catch(() => {});
            }
        }
    } catch (_) {}
});

// ============================================================================
// 12. EXPRESS WEB SUNUCUSU VE OAUTH2 / API UÇ NOKTALARI
// ============================================================================
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/kayitlar', express.static(KAYITLAR_DIR));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function yetkiliOturumKontrol(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token || '');
    const oturum = sessions.get(token);
    if (!oturum) {
        return res.status(401).json({ hata: 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.' });
    }
    req.oturum = oturum;
    req.authToken = token;
    next();
}

// DISCORD OAUTH2 BAŞLAT
app.get('/auth/discord', (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.redirect('/?auth_error=' + encodeURIComponent('.env dosyasında CLIENT_ID veya CLIENT_SECRET eksik!'));
    }
    const scope = encodeURIComponent('identify guilds');
    const redirectUri = encodeURIComponent(REDIRECT_URI);
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    res.redirect(url);
});

// DISCORD OAUTH2 CALLBACK
app.get('/auth/discord/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            return res.redirect('/?auth_error=' + encodeURIComponent('Discord yetkilendirme kodu (code) alınamadı.'));
        }

        const tokenParams = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: String(code),
            redirect_uri: REDIRECT_URI
        });

        const tokenRes = await guvenliFetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString()
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
            const errDetay = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
            return res.redirect('/?auth_error=' + encodeURIComponent(`Discord Token Hatası: ${errDetay}`));
        }

        const [userRes, guildsRes] = await Promise.all([
            guvenliFetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            }),
            guvenliFetch('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            })
        ]);

        const user = await userRes.json();
        const guilds = await guildsRes.json();

        const panelToken = crypto.randomBytes(32).toString('hex');
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;

        sessions.set(panelToken, {
            id: user.id,
            username: user.global_name || user.username,
            avatar: avatarUrl,
            guilds: Array.isArray(guilds) ? guilds : [],
            isLocalAdmin: false,
            olusturma: Date.now()
        });
        sessionKaydet();

        const redirectUrl = `/?token=${encodeURIComponent(panelToken)}&id=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.global_name || user.username)}&avatar=${encodeURIComponent(avatarUrl)}`;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('OAuth2 Callback Hatası:', err);
        res.redirect('/?auth_error=' + encodeURIComponent(`Bağlantı Hatası: ${err.message}`));
    }
});

// YEREL KOMUTA GİRİŞİ (LOCALHOST HIZLI ERİŞİM)
app.post('/auth/local-login', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const yerelMi = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost');
    if (!yerelMi && process.env.ALLOW_REMOTE_LOCAL_LOGIN !== 'true') {
        return res.status(403).json({ hata: 'Yerel hızlı giriş yalnızca sunucu bilgisayarından (localhost) kullanılabilir.' });
    }

    const panelToken = crypto.randomBytes(32).toString('hex');
    const avatarUrl = client.user?.displayAvatarURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const username = 'Başkomutan (Yerel Oturum)';

    sessions.set(panelToken, {
        id: 'local_admin',
        username,
        avatar: avatarUrl,
        guilds: [],
        isLocalAdmin: true,
        olusturma: Date.now()
    });
    sessionKaydet();

    res.json({
        basarili: true,
        token: panelToken,
        user: { id: 'local_admin', username, avatar: avatarUrl }
    });
});

// YÖNETİLEN SUNUCULAR LİSTESİ
app.get('/api/sunucular', yetkiliOturumKontrol, (req, res) => {
    const botGuilds = Array.from(client.guilds.cache.values());
    let uygunSunucular = [];

    if (req.oturum.isLocalAdmin) {
        uygunSunucular = botGuilds;
    } else {
        const userGuildMap = new Map((req.oturum.guilds || []).map(g => [g.id, g]));
        uygunSunucular = botGuilds.filter(bg => {
            const ug = userGuildMap.get(bg.id);
            if (!ug) return false;
            const perms = BigInt(ug.permissions || 0);
            const adminBit = BigInt(0x8);
            const manageGuildBit = BigInt(0x20);
            return ug.owner || (perms & adminBit) === adminBit || (perms & manageGuildBit) === manageGuildBit;
        });
    }

    res.json({
        sunucular: uygunSunucular.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
        }))
    });
});

// SUNUCU PANEL VERİLERİ
app.get('/api/panel/:guildId', yetkiliOturumKontrol, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı veya bot bu sunucuda değil.' });

    const ayarlar = sunucuAyarGetir(guild.id);
    const aktifOturum = aktifSesOturumlari.get(guild.id);
    const kayitlar = (db.sesKayitlari || []).filter(k => k.guildId === guild.id);

    const metinKanallari = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ id: c.id, name: '#' + c.name }));

    const sesKanallari = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildVoice)
        .map(c => ({ id: c.id, name: '🔊 ' + c.name }));

    const kategoriler = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .map(c => ({ id: c.id, name: c.name }));

    const roller = guild.roles.cache
        .filter(r => !r.managed && r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => ({ id: r.id, name: '@' + r.name }));

    const cevrimiciUye = guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size;

    res.json({
        sunucuAdi: guild.name,
        sunucuIkon: guild.iconURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
        uyeSayisi: guild.memberCount,
        cevrimiciUye,
        kanalSayisi: guild.channels.cache.size,
        rolSayisi: roller.length,
        ping: client.ws.ping,
        uptimeSaniye: Math.floor(process.uptime()),
        ayarlar,
        metinKanallari,
        sesKanallari,
        kategoriler,
        roller,
        aktifSes: aktifOturum ? { aktif: true, kanalId: aktifOturum.kanalId, kanalAdi: aktifOturum.kanalAdi } : { aktif: false },
        kayitlar
    });
});

// AYAR KAYDET
app.post('/api/ayarlar', yetkiliOturumKontrol, (req, res) => {
    const { guildId, yeniAyarlar, aciklama } = req.body;
    if (!guildId || !yeniAyarlar) return res.status(400).json({ hata: 'Eksik parametre.' });

    const mevcut = sunucuAyarGetir(guildId);
    db.sunucular[guildId] = {
        ...mevcut,
        ...yeniAyarlar,
        automod: yeniAyarlar.automod ? { ...mevcut.automod, ...yeniAyarlar.automod } : mevcut.automod,
        leveling: yeniAyarlar.leveling ? { ...mevcut.leveling, ...yeniAyarlar.leveling } : mevcut.leveling
    };
    logEkle(guildId, 'PANEL', 'Ayarlar Güncellendi', aciklama || 'Panel üzerinden yapılandırma kaydedildi', req.oturum.username);
    res.json({ basarili: true });
});

// ROBLOX TSF ROLLERİNİ GETİR (WEB PANEL DROPDOWN İÇİN)
app.get('/api/roblox/roller/:guildId', yetkiliOturumKontrol, async (req, res) => {
    try {
        const ayar = sunucuAyarGetir(req.params.guildId);
        const groupId = ayar.robloxGrupId || DEFAULT_ROBLOX_GROUP_ID;
        const roller = await robloxGrupRolleriniGetir(groupId, req.query.yenile === '1');
        res.json({ basarili: true, groupId, roller });
    } catch (err) {
        res.status(500).json({ basarili: false, hata: err.message });
    }
});

// WEB PANEL ÜZERİNDEN DOĞRUDAN ROBLOX & DISCORD RÜTBE VERME
app.post('/api/roblox/rutbe-ver', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, robloxKullaniciAdi, hedefRolId } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });

        const sonuc = await tamRutbeIslemiYap({
            guild,
            robloxKullaniciAdi,
            hedefRolId,
            hedefDiscordMember: null,
            yetkiliEtiket: `${req.oturum.username} (Web Panel)`
        });

        res.json({
            basarili: true,
            mesaj: `${sonuc.robloxUser.username}: ${sonuc.eskiRolAdi} → ${sonuc.yeniRol.name} (${sonuc.discordDurum})`
        });
    } catch (err) {
        res.status(400).json({ basarili: false, hata: err.message });
    }
});

// YAPAY ZEKA CANLI TEST
app.post('/api/ai-test', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, soru } = req.body;
        const ayar = sunucuAyarGetir(guildId);
        const yanit = await geminiSor(ayar.aiSistemTalimati, soru);
        res.json({ basarili: true, yanit });
    } catch (err) {
        res.status(500).json({ basarili: false, yanit: 'Hata: ' + err.message });
    }
});

// KANALA GÖRSELLİ TICKET MENÜSÜ KUR
app.post('/api/ticket-kur', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, aciklama, gorselUrl } = req.body;
        const guild = client.guilds.cache.get(guildId);
        const kanal = guild?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Hedef metin kanalı bulunamadı.' });

        const ayar = sunucuAyarGetir(guildId);
        if (gorselUrl !== undefined) {
            ayar.ticketPanelGorselUrl = gorselUrl.trim();
            dbKaydet(db);
        }

        const konular = (ayar.ticketKonular && ayar.ticketKonular.length > 0)
            ? ayar.ticketKonular
            : [{ id: 'genel_destek', isim: 'Genel Destek', aciklama: 'Yardım talebi oluştur', emoji: '🎫' }];

        const embed = new EmbedBuilder()
            .setColor('#3b82f6')
            .setTitle(baslik || '🎫 ORDU YÖNETİMİ — Destek & Yardım Merkezi')
            .setDescription(aciklama || 'Aşağıdaki menüden kategori seçerek destek bileti açabilirsiniz.')
            .setFooter({ text: 'ORDU YÖNETİMİ • Akıllı Destek Sistemi' })
            .setTimestamp();

        const aktifGorsel = (gorselUrl || ayar.ticketPanelGorselUrl || '').trim();
        if (aktifGorsel && aktifGorsel.startsWith('http')) {
            embed.setImage(aktifGorsel);
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_kategori_sec')
            .setPlaceholder('📂 Destek Kategorisi Seçin...')
            .addOptions(
                konular.slice(0, 25).map(k => ({
                    label: k.isim.slice(0, 100),
                    description: (k.aciklama || 'Destek talebi oluştur').slice(0, 100),
                    value: k.id,
                    emoji: k.emoji || '🎫'
                }))
            );

        await kanal.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(menu)]
        });

        logEkle(guildId, 'TICKET', 'Ticket Paneli Kuruldu', `#${kanal.name}`, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) {
        res.status(500).json({ basarili: false, hata: err.message });
    }
});

// CANLI SES DİNLEME BAŞLAT / DURDUR / STREAM / SİL
app.post('/api/ses-dinle/baslat', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, kayitYap } = req.body;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ hata: 'Sunucu bulunamadı.' });
        const oturum = await sesDinlemeBaslat(guild, kanalId, kayitYap);
        logEkle(guildId, 'SES', 'Canlı Dinleme Başlatıldı', `#${oturum.kanalAdi}`, req.oturum.username);
        res.json({ basarili: true, kanalAdi: oturum.kanalAdi });
    } catch (err) {
        res.status(400).json({ basarili: false, hata: err.message });
    }
});

app.post('/api/ses-dinle/durdur', yetkiliOturumKontrol, async (req, res) => {
    const { guildId } = req.body;
    const sonuc = await sesDinlemeDurdur(guildId);
    logEkle(guildId, 'SES', 'Canlı Dinleme Durduruldu', sonuc?.dosyaAdi || 'Kayıtsız kapatıldı', req.oturum.username);
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
        const dosyaYolu = path.join(KAYITLAR_DIR, silinen.dosyaAdi);
        if (fs.existsSync(dosyaYolu)) fs.unlinkSync(dosyaYolu);
        dbKaydet(db);
    }
    res.json({ basarili: true });
});

// GİRİŞ-ÇIKIŞ TEST KARTI GÖNDER
app.post('/api/test-kart', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, tur } = req.body;
        const guild = client.guilds.cache.get(guildId);
        const ayar = sunucuAyarGetir(guildId);
        const kanal = guild?.channels.cache.get(ayar.girisCikisLogKanal);
        if (!kanal) {
            return res.status(400).json({ hata: 'Önce Giriş-Çıkış Görsel Kart Kanalını seçip kaydedin!' });
        }

        const girisMi = tur === 'giris';
        const embed = new EmbedBuilder()
            .setColor(girisMi ? '#10b981' : '#ef4444')
            .setTitle(girisMi ? '📥 [TEST] Yeni Personel Katıldı!' : '📤 [TEST] Personel Ayrıldı')
            .setDescription(`Test Kullanıcısı: **${req.oturum.username}**\nSunucu Üye Sayısı: **${guild.memberCount}**`)
            .setThumbnail(req.oturum.avatar)
            .setTimestamp();

        const bgUrl = girisMi ? ayar.girisArkaPlanUrl : ayar.cikisArkaPlanUrl;
        if (bgUrl && bgUrl.startsWith('http')) embed.setImage(bgUrl);

        await kanal.send({ embeds: [embed] });
        res.json({ basarili: true });
    } catch (err) {
        res.status(500).json({ basarili: false, hata: err.message });
    }
});

// DUYURU GÖNDER (GÖRSEL DESTEKLİ)
app.post('/api/duyuru', yetkiliOturumKontrol, async (req, res) => {
    try {
        const { guildId, kanalId, baslik, icerik, renk, gorselUrl, herkesiEtiketle } = req.body;
        const guild = client.guilds.cache.get(guildId);
        const kanal = guild?.channels.cache.get(kanalId);
        if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });

        const embed = new EmbedBuilder()
            .setColor(renk || '#3b82f6')
            .setTitle(baslik || '📢 ORDU YÖNETİMİ — Resmi Duyuru')
            .setDescription(icerik)
            .setFooter({ text: `Yayınlayan: ${req.oturum.username}` })
            .setTimestamp();

        if (gorselUrl && gorselUrl.trim().startsWith('http')) {
            embed.setImage(gorselUrl.trim());
        }

        await kanal.send({
            content: herkesiEtiketle ? '@everyone' : undefined,
            embeds: [embed]
        });

        logEkle(guildId, 'PANEL', 'Duyuru Yayınlandı', `#${kanal.name}: ${(baslik || '').slice(0, 50)}`, req.oturum.username);
        res.json({ basarili: true });
    } catch (err) {
        res.status(500).json({ basarili: false, hata: err.message });
    }
});

// UYARI SİL
app.delete('/api/uyari/:guildId/:uyariId', yetkiliOturumKontrol, (req, res) => {
    const ayar = sunucuAyarGetir(req.params.guildId);
    ayar.uyarilar = (ayar.uyarilar || []).filter(u => u.id !== req.params.uyariId);
    dbKaydet(db);
    res.json({ basarili: true });
});

// ============================================================================
// 13. SUNUCUYU VE BOTU BAŞLAT
// ============================================================================
app.listen(PORT, () => {
    console.log(`🚀 ORDU YÖNETİMİ API & Web Panel http://localhost:${PORT} adresinde hazır.`);
});

if (!DISCORD_TOKEN) {
    console.error('❌ HATA: .env dosyasında DISCORD_TOKEN bulunamadı!');
} else {
    client.login(DISCORD_TOKEN).catch((err) => {
        console.error('❌ Discord Bot Giriş Hatası:', err.message);
    });
}