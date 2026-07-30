/**
 * konfigurasi-renderer.js -- Layar "Konfigurasi" (Kasir Desktop): 3 seksi independen.
 *
 * 1. Tampilan Aplikasi (judul+logo) -- murni LOKAL, lihat JavaDoc {@code posAPI.branding} (preload.js)
 *    / {@code BRANDING_PATH} (main.js). Tak pernah dikirim ke server.
 * 2. Profil Toko -- tersimpan di server, lihat JavaDoc server {@code KantinHelper.tokoProfilAmbil}/
 *    {@code tokoProfilSimpan}. Form disabled (hanya-lihat) bila {@code bolehUbah:false}.
 * 3. Akun Pedagang -- daftar+kelola akun kasir toko ini, lihat JavaDoc server
 *    {@code KantinHelper.pedagangList}/{@code pedagangUbah} dan {@code tambahAkunKasir}. Tombol
 *    tambah/ubah disembunyikan bila bukan supervisor/admin -- penegakan SEBENARNYA di server
 *    (prinsip "jangan percaya klien" yg sama dipakai di seluruh PosApi).
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elToast = document.getElementById('toast');

    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        clearTimeout(tampilkanToast._t);
        tampilkanToast._t = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }
    function escapeHtmlLokal(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    let isAdminAkun = false;
    let supervisorPedagang = false;
    let aksesMenuCrud = {};

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan */ }
        try {
            const cfg = await window.electronAPI.posAPI.konfigurasi();
            if (cfg.ok) {
                elNamaToko.textContent = cfg.data.tokoNama || (cfg.data.userId ? ('Kasir - ' + cfg.data.userId) : 'Kasir');
                isAdminAkun = !!cfg.data.isAdmin;
                supervisorPedagang = !!cfg.data.supervisorPedagang;
                aksesMenuCrud = cfg.data.aksesMenuCrud || {};
                terapkanGerbangAkses();
            }
        } catch (e) { /* abaikan */ }
    }

    const bolehAksiMenu = (kunci, aksi) => {
        if (isAdminAkun || supervisorPedagang) return true;
        const crud = aksesMenuCrud && aksesMenuCrud[kunci];
        if (!crud) return false;
        if (crud.supervisor === true) return true;
        return crud[aksi] !== false;
    };
    const bolehKelolaPedagang = () => bolehAksiMenu('pedagang', 'update') || bolehAksiMenu('pedagang', 'create');
    const bolehUbahSupervisorPedagang = () => bolehAksiMenu('pedagang', 'supervisor');

    function terapkanGerbangAkses() {
        document.getElementById('btnTambahPedagang').style.display = bolehKelolaPedagang() ? '' : 'none';
        document.getElementById('catatanAksesPedagang').style.display = bolehKelolaPedagang() ? 'none' : '';
    }

    // ==== Seksi 1: Tampilan Aplikasi (lokal) ====

    const elInputJudulAplikasi = document.getElementById('inputJudulAplikasi');
    const elLogoPreview = document.getElementById('logoPreview');
    const elBtnPilihLogo = document.getElementById('btnPilihLogo');
    const elBtnSimpanBranding = document.getElementById('btnSimpanBranding');

    function tampilkanLogoPreview(logoLokalPath) {
        if (logoLokalPath) {
            elLogoPreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = logoLokalPath;
            elLogoPreview.appendChild(img);
        } else {
            elLogoPreview.textContent = '\u{1F4B3}';
        }
    }

    async function muatBranding() {
        try {
            const r = await window.electronAPI.posAPI.branding.ambil();
            if (r.ok && r.data) {
                elInputJudulAplikasi.value = r.data.judulAplikasi || 'POS Kasir';
                tampilkanLogoPreview(r.data.logoLokalPath);
            }
        } catch (e) { /* abaikan */ }
    }

    elBtnPilihLogo.addEventListener('click', async () => {
        elBtnPilihLogo.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.branding.pilihLogo();
            if (r.dibatalkan) return;
            if (r.ok) {
                tampilkanLogoPreview(r.data.logoLokalPath);
                tampilkanToast('success', 'Logo diperbarui. Buka ulang halaman lain agar sidebar ikut berubah.');
            } else {
                tampilkanToast('error', r.pesan || 'Gagal memilih logo.');
            }
        } finally {
            elBtnPilihLogo.disabled = false;
        }
    });

    elBtnSimpanBranding.addEventListener('click', async () => {
        elBtnSimpanBranding.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.branding.simpanJudul({ judulAplikasi: elInputJudulAplikasi.value.trim() });
            if (r.ok) {
                tampilkanToast('success', 'Tampilan aplikasi disimpan.');
            } else {
                tampilkanToast('error', r.pesan || 'Gagal menyimpan.');
            }
        } finally {
            elBtnSimpanBranding.disabled = false;
        }
    });

    // ==== Seksi 1b: Identitas Mesin POS (lokal) ====

    const elInputNamaMesin = document.getElementById('inputNamaMesin');
    const elTeksIdMesin = document.getElementById('teksIdMesin');
    const elBtnSimpanNamaMesin = document.getElementById('btnSimpanNamaMesin');

    async function muatIdentitasMesin() {
        try {
            const r = await window.electronAPI.posAPI.identitasMesinBaca();
            if (r.ok && r.data) {
                elInputNamaMesin.value = r.data.namaMesin || '';
                elTeksIdMesin.textContent = r.data.idMesin || '-';
            }
        } catch (e) { /* abaikan -- field tetap kosong, bukan blocker */ }
    }

    elBtnSimpanNamaMesin.addEventListener('click', async () => {
        elBtnSimpanNamaMesin.disabled = true;
        try {
            const r = await window.electronAPI.posAPI.identitasMesinSimpan({ namaMesin: elInputNamaMesin.value.trim() });
            if (r.ok) {
                tampilkanToast('success', 'Nama mesin disimpan.');
            } else {
                tampilkanToast('error', r.pesan || 'Gagal menyimpan.');
            }
        } finally {
            elBtnSimpanNamaMesin.disabled = false;
        }
    });

    // ==== Seksi 2: Profil Toko (server) ====

    const elCatatanAksesToko = document.getElementById('catatanAksesToko');
    const tp = {
        nama: document.getElementById('tpNama'), kode: document.getElementById('tpKode'),
        alamat: document.getElementById('tpAlamat'), kota: document.getElementById('tpKota'),
        kodePos: document.getElementById('tpKodePos'), telp: document.getElementById('tpTelp'),
        email: document.getElementById('tpEmail'), picNama: document.getElementById('tpPicNama'),
        picHp: document.getElementById('tpPicHp'), npwp: document.getElementById('tpNpwp'),
        jamOperasional: document.getElementById('tpJamOperasional'), keterangan: document.getElementById('tpKeterangan'),
        pesanTerimaKasih: document.getElementById('tpPesanTerimaKasih')
    };
    const elBtnSimpanProfilToko = document.getElementById('btnSimpanProfilToko');
    let bolehUbahToko = false;

    function terapkanGerbangToko() {
        const kunci = !bolehUbahToko;
        Object.keys(tp).forEach((k) => { if (k !== 'kode') tp[k].disabled = kunci; });
        elBtnSimpanProfilToko.style.display = kunci ? 'none' : '';
        elCatatanAksesToko.style.display = kunci ? '' : 'none';
    }

    async function muatProfilToko() {
        try {
            const r = await window.electronAPI.posAPI.tokoProfil.ambil({});
            if (!r.ok) {
                if (!r.offline) window.PesanDetail.tampilkanDariHasil(r);
                return;
            }
            const d = r.data || {};
            tp.nama.value = d.nama || '';
            tp.kode.value = d.kode || '';
            tp.alamat.value = d.alamat || '';
            tp.kota.value = d.kota || '';
            tp.kodePos.value = d.kodePos || '';
            tp.telp.value = d.telp || '';
            tp.email.value = d.email || '';
            tp.picNama.value = d.picNama || '';
            tp.picHp.value = d.picHp || '';
            tp.npwp.value = d.npwp || '';
            tp.jamOperasional.value = d.jamOperasional || '';
            tp.keterangan.value = d.keterangan || '';
            // d.pesanTerimaKasih SELALU terisi (server fallback ke teks formal default kalau kolom
            // kosong, lihat Toko.getPesanTerimaKasih) -- textarea kosong di sini cuma bisa terjadi
            // kalau field belum termuat sama sekali (server versi lama sblm fitur ini).
            tp.pesanTerimaKasih.value = d.pesanTerimaKasih || '';
            bolehUbahToko = !!r.bolehUbah;
            terapkanGerbangToko();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat profil toko: ' + (e && e.message ? e.message : e));
        }
    }

    elBtnSimpanProfilToko.addEventListener('click', async () => {
        const nama = tp.nama.value.trim();
        if (!nama) { tampilkanToast('error', 'Nama toko wajib diisi.'); tp.nama.focus(); return; }
        const payload = {
            nama, alamat: tp.alamat.value.trim(), kota: tp.kota.value.trim(),
            kode_pos: tp.kodePos.value.trim(), telp: tp.telp.value.trim(), email: tp.email.value.trim(),
            pic_nama: tp.picNama.value.trim(), pic_hp: tp.picHp.value.trim(), npwp: tp.npwp.value.trim(),
            jam_operasional: tp.jamOperasional.value.trim(), keterangan: tp.keterangan.value.trim(),
            pesan_terima_kasih: tp.pesanTerimaKasih.value.trim()
        };
        elBtnSimpanProfilToko.disabled = true;
        elBtnSimpanProfilToko.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.tokoProfil.simpan(payload);
            if (r.ok) {
                tampilkanToast('success', 'Profil toko disimpan.');
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSimpanProfilToko.disabled = false;
            elBtnSimpanProfilToko.textContent = 'Simpan Profil Toko';
        }
    });

    // ==== Seksi 3: Akun Pedagang ====

    const elTabelPedagang = document.getElementById('tabelPedagang');
    const elBtnTambahPedagang = document.getElementById('btnTambahPedagang');

    const elOverlayFormPedagang = document.getElementById('overlayFormPedagang');
    const elJudulFormPedagang = document.getElementById('judulFormPedagang');
    const elBtnTutupFormPedagang = document.getElementById('btnTutupFormPedagang');
    const elWrapPedagangUserid = document.getElementById('wrapPedagangUserid');
    const elFpUserid = document.getElementById('fpUserid');
    const elFpNama = document.getElementById('fpNama');
    const elWrapPedagangPassword = document.getElementById('wrapPedagangPassword');
    const elLabelPedagangPassword = document.getElementById('labelPedagangPassword');
    const elFpPassword = document.getElementById('fpPassword');
    const elWrapPedagangTokoId = document.getElementById('wrapPedagangTokoId');
    const elFpTokoId = document.getElementById('fpTokoId');
    const elFpKeterangan = document.getElementById('fpKeterangan');
    const elFpAktif = document.getElementById('fpAktif');
    const elWrapPedagangSupervisor = document.getElementById('wrapPedagangSupervisor');
    const elFpSupervisor = document.getElementById('fpSupervisor');
    const elBtnSimpanPedagang = document.getElementById('btnSimpanPedagang');

    // Fitur "Hak Akses Menu per Akun" -- peta {kunci payload server -> elemen checkbox}, SATU sumber
    // dipakai reset/isi-ulang/kumpulkan form, supaya menambah/mengurangi menu di masa depan cukup
    // ubah daftar ini (bukan menyalin 13 baris berulang di 3 tempat berbeda).
    const PETA_AKSES_MENU = {
        aksesKasir: document.getElementById('fpAksesKasir'),
        aksesRingkasan: document.getElementById('fpAksesRingkasan'),
        aksesPesanan: document.getElementById('fpAksesPesanan'),
        aksesAnggota: document.getElementById('fpAksesAnggota'),
        aksesProduk: document.getElementById('fpAksesProduk'),
        aksesStokOpname: document.getElementById('fpAksesStokOpname'),
        aksesKulakan: document.getElementById('fpAksesKulakan'),
        aksesDiskon: document.getElementById('fpAksesDiskon'),
        aksesLaporanTransaksi: document.getElementById('fpAksesLaporanTransaksi'),
        aksesLaporan: document.getElementById('fpAksesLaporan'),
        aksesRiwayatSinkronisasi: document.getElementById('fpAksesRiwayatSinkronisasi'),
        aksesLogError: document.getElementById('fpAksesLogError'),
        aksesKonfigurasi: document.getElementById('fpAksesKonfigurasi'),
    };

    function renderTabelPedagang(daftar) {
        if (!daftar || daftar.length === 0) {
            elTabelPedagang.innerHTML = '<tr><td><div class="daftar-kosong"><span class="ico">&#128101;</span>Belum ada akun pedagang.</div></td></tr>';
            return;
        }
        let html = '<thead><tr><th>Userid</th><th>Nama</th><th>Keterangan</th><th>Status</th><th>Peran</th><th></th></tr></thead><tbody>';
        daftar.forEach((p) => {
            html += '<tr>'
                + '<td style="font-weight:700;">' + escapeHtmlLokal(p.userid) + '</td>'
                + '<td>' + escapeHtmlLokal(p.nama) + '</td>'
                + '<td>' + escapeHtmlLokal(p.keterangan || '-') + '</td>'
                + '<td>' + (p.aktif ? '<span class="badge hijau">Aktif</span>' : '<span class="badge abu">Non-Aktif</span>') + '</td>'
                + '<td>' + (p.supervisor ? '<span class="badge ungu">Supervisor</span>' : '<span class="badge abu">Kasir</span>') + '</td>'
                + '<td>' + (bolehKelolaPedagang() ? '<button type="button" class="btn-kecil ubah-pedagang" data-id="' + p.id + '">Ubah</button>' : '') + '</td>'
                + '</tr>';
        });
        html += '</tbody>';
        elTabelPedagang.innerHTML = html;
        elTabelPedagang.querySelectorAll('.ubah-pedagang').forEach((el) => {
            el.addEventListener('click', () => bukaFormUbah(daftar.find((p) => String(p.id) === el.getAttribute('data-id'))));
        });
    }

    async function muatDaftarPedagang() {
        try {
            const r = await window.electronAPI.posAPI.pedagang.list({});
            if (!r.ok) {
                if (!r.offline) window.PesanDetail.tampilkanDariHasil(r);
                renderTabelPedagang([]);
                return;
            }
            renderTabelPedagang((r.data && r.data.data) || []);
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat akun pedagang: ' + (e && e.message ? e.message : e));
        }
    }

    let idPedagangDiubah = null;

    function resetFormPedagang() {
        elFpUserid.value = ''; elFpNama.value = ''; elFpPassword.value = ''; elFpTokoId.value = '';
        elFpKeterangan.value = ''; elFpAktif.checked = true; elFpSupervisor.checked = false;
        // Default SEMUA menu aktif (lihat JavaDoc server Pedagang.getAksesKasir() dkk) -- berlaku baik
        // utk "Tambah Akun" (akun baru) maupun sblm bukaFormUbah() menimpanya dgn nilai baris asli.
        Object.keys(PETA_AKSES_MENU).forEach((k) => { PETA_AKSES_MENU[k].checked = true; });
    }

    function bukaFormTambah() {
        idPedagangDiubah = null;
        elJudulFormPedagang.textContent = 'Tambah Akun Pedagang';
        resetFormPedagang();
        elWrapPedagangUserid.style.display = '';
        elLabelPedagangPassword.textContent = 'Kata Sandi (min. 6 karakter)';
        elWrapPedagangTokoId.style.display = isAdminAkun ? '' : 'none';
        // Gap-closure "supervisor boleh buat Supervisor lain juga, bukan cuma Kasir" -- checkbox ini
        // SEBELUMNYA hanya utk admin global; sekarang jg tampil utk supervisor toko (server sudah
        // menghormati field ini utk kedua jenis pemanggil, lihat JavaDoc KantinHelper.tambahAkunKasir).
        elWrapPedagangSupervisor.style.display = bolehUbahSupervisorPedagang() ? '' : 'none';
        elOverlayFormPedagang.className = 'overlay tampil';
        elFpUserid.focus();
    }

    function bukaFormUbah(p) {
        if (!p) return;
        idPedagangDiubah = p.id;
        elJudulFormPedagang.textContent = 'Ubah Akun: ' + p.nama;
        resetFormPedagang();
        elWrapPedagangUserid.style.display = 'none';
        elLabelPedagangPassword.textContent = 'Kata Sandi Baru (opsional, min. 6 karakter)';
        elWrapPedagangTokoId.style.display = 'none';
        elFpNama.value = p.nama || '';
        elFpKeterangan.value = p.keterangan || '';
        elFpAktif.checked = p.aktif !== false;
        elFpSupervisor.checked = !!p.supervisor;
        elWrapPedagangSupervisor.style.display = bolehUbahSupervisorPedagang() ? '' : 'none';
        Object.keys(PETA_AKSES_MENU).forEach((k) => { PETA_AKSES_MENU[k].checked = p[k] !== false; });
        elOverlayFormPedagang.className = 'overlay tampil';
        elFpNama.focus();
    }

    elBtnTambahPedagang.addEventListener('click', bukaFormTambah);
    elBtnTutupFormPedagang.addEventListener('click', () => { elOverlayFormPedagang.className = 'overlay'; });

    elBtnSimpanPedagang.addEventListener('click', async () => {
        const nama = elFpNama.value.trim();
        if (!nama) { tampilkanToast('error', 'Nama wajib diisi.'); elFpNama.focus(); return; }

        elBtnSimpanPedagang.disabled = true;
        elBtnSimpanPedagang.textContent = 'Menyimpan...';
        try {
            let r;
            if (idPedagangDiubah) {
                const payload = { id: idPedagangDiubah, nama, keterangan: elFpKeterangan.value.trim(), aktif: elFpAktif.checked };
                if (elFpPassword.value) payload.password_baru = elFpPassword.value;
                if (bolehUbahSupervisorPedagang()) payload.supervisor = elFpSupervisor.checked;
                Object.keys(PETA_AKSES_MENU).forEach((k) => { payload[k] = PETA_AKSES_MENU[k].checked; });
                r = await window.electronAPI.posAPI.pedagang.ubah(payload);
            } else {
                const userid = elFpUserid.value.trim();
                const password = elFpPassword.value;
                if (!userid || !password) { tampilkanToast('error', 'Userid dan kata sandi wajib diisi.'); return; }
                if (password.length < 6) { tampilkanToast('error', 'Kata sandi minimal 6 karakter.'); return; }
                const payload = { userid, password, nama, keterangan: elFpKeterangan.value.trim() };
                if (isAdminAkun) payload.toko_id = elFpTokoId.value || null;
                if (bolehUbahSupervisorPedagang()) payload.supervisor = elFpSupervisor.checked;
                Object.keys(PETA_AKSES_MENU).forEach((k) => { payload[k] = PETA_AKSES_MENU[k].checked; });
                r = await window.electronAPI.posAPI.akun.tambah(payload);
            }
            if (r.ok) {
                tampilkanToast('success', idPedagangDiubah ? 'Akun pedagang diperbarui.' : 'Akun pedagang baru ditambahkan.');
                elOverlayFormPedagang.className = 'overlay';
                muatDaftarPedagang();
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSimpanPedagang.disabled = false;
            elBtnSimpanPedagang.textContent = 'Simpan';
        }
    });

    // ==== Inisialisasi ====
    (async function inisialisasi() {
        await segarkanStatus();
        terapkanGerbangAkses();
        muatBranding();
        muatIdentitasMesin();
        muatProfilToko();
        muatDaftarPedagang();
    })();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
