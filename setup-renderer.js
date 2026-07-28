/**
 * setup-renderer.js -- Logika form wizard pengaturan (setup.html). Berjalan di konteks renderer
 * terisolasi; satu-satunya jembatan ke proses utama adalah window.setupAPI (diekspos preload-setup.js).
 * File terpisah (bukan inline <script> di setup.html) supaya Content-Security-Policy default Electron
 * (yang melarang skrip inline) tidak perlu dilonggarkan.
 */
(function () {
    const elHost = document.getElementById('host');
    const elContextPath = document.getElementById('contextPath');
    const elHttps = document.getElementById('https');
    const elPreview = document.getElementById('preview');
    const elError = document.getElementById('errorMsg');
    const elBtnSave = document.getElementById('btnSave');
    const elBtnTest = document.getElementById('btnTest');
    const elTestResult = document.getElementById('testResult');
    const elSaveHint = document.getElementById('saveHint');

    /**
     * Menjaga gerbang "tidak boleh Simpan sebelum Tes Koneksi berhasil": true HANYA ketika hasil
     * Tes Koneksi TERAKHIR berstatus sukses DAN dilakukan terhadap kombinasi host/contextPath/https
     * yang PERSIS SAMA dengan yang sedang tampil di form saat ini. Diset kembali ke false oleh
     * updatePreviewDanValidasi() setiap kali salah satu field diubah, supaya pengguna tidak bisa
     * mengetes "server-benar.id", lalu diam-diam mengganti ke host lain dan tetap lolos Simpan
     * memakai status hijau dari host yang berbeda.
     */
    let sudahTesBerhasil = false;

    function updateSaveGate() {
        const validNow = isHostValid(sanitizeHost(elHost.value));
        elBtnSave.disabled = !(validNow && sudahTesBerhasil);
        elSaveHint.style.display = elBtnSave.disabled ? '' : 'none';
    }

    /** Membersihkan input host: buang skema/garis-miring yang mungkin ikut tertempel saat menempel (paste). */
    function sanitizeHost(raw) {
        return (raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    /** Membersihkan context path: buang garis miring di awal/akhir. */
    function sanitizeContextPath(raw) {
        return (raw || '').trim().replace(/^\/+|\/+$/g, '');
    }

    /** Validasi host sangat longgar (bukan regex domain ketat) -- cukup pastikan tidak kosong dan tidak mengandung spasi. */
    function isHostValid(host) {
        return host.length > 0 && !/\s/.test(host);
    }

    function updatePreviewDanValidasi() {
        const host = sanitizeHost(elHost.value);
        const ctx = sanitizeContextPath(elContextPath.value);
        const scheme = elHttps.checked ? 'https' : 'http';
        const valid = isHostValid(host);

        elPreview.textContent = valid ? (scheme + '://' + host + (ctx ? '/' + ctx : '') + '/') : (scheme + '://…');
        elHost.classList.toggle('invalid', elHost.value.length > 0 && !valid);
        elBtnTest.disabled = !valid;
        elError.textContent = '';
        // Hasil tes sebelumnya jadi basi begitu alamat diubah -- sembunyikan lagi supaya tidak
        // menyesatkan (mis. pengguna tes "demo.ecampus.id" berhasil, lalu diam-diam ketik ulang
        // jadi host lain tapi status hijau lamanya masih menempel di layar), dan kunci lagi tombol
        // Simpan sampai Tes Koneksi diulang utk nilai yang baru.
        elTestResult.className = 'test-result';
        elTestResult.textContent = '';
        sudahTesBerhasil = false;
        updateSaveGate();
        return { host, ctx, scheme, valid };
    }

    elHost.addEventListener('input', updatePreviewDanValidasi);
    elContextPath.addEventListener('input', updatePreviewDanValidasi);
    elHttps.addEventListener('change', updatePreviewDanValidasi);

    /** Format ringkas hasil sukses: status HTTP + waktu tempuh, mis. "status 302, 184 md". */
    function formatDurasi(ms) {
        return ms < 1000 ? (ms + ' md') : ((ms / 1000).toFixed(1) + ' dtk');
    }

    elBtnTest.addEventListener('click', async () => {
        const { host, ctx, valid } = updatePreviewDanValidasi();
        if (!valid) {
            elError.textContent = 'Alamat host wajib diisi dan tidak boleh mengandung spasi.';
            elHost.focus();
            return;
        }
        elBtnTest.disabled = true;
        elBtnTest.textContent = 'Menguji koneksi…';
        elTestResult.className = 'test-result testing';
        elTestResult.textContent = 'Menghubungi server, mohon tunggu…';
        // cfg yang diuji direkam SEKARANG -- dipakai nanti membandingkan dgn isi form saat hasil
        // tes datang, supaya tes yg selesai belakangan setelah pengguna sempat ganti host tidak
        // salah membuka gerbang Simpan utk nilai yg sebenarnya belum pernah dites.
        const cfgDiuji = { host: host, ctx: ctx, https: elHttps.checked };

        try {
            const hasil = await window.setupAPI.testConnection({ host: host, contextPath: ctx, https: elHttps.checked });
            const cfgSekarang = { host: sanitizeHost(elHost.value), ctx: sanitizeContextPath(elContextPath.value), https: elHttps.checked };
            const masihRelevan = cfgDiuji.host === cfgSekarang.host && cfgDiuji.ctx === cfgSekarang.ctx && cfgDiuji.https === cfgSekarang.https;

            if (hasil.ok) {
                elTestResult.className = 'test-result success';
                elTestResult.textContent = '✓ Server terjangkau (status HTTP ' + hasil.status + ', ' + formatDurasi(hasil.durasiMs) + '). '
                        + 'Alamat sudah benar -- silakan lanjut Simpan & Buka Aplikasi.';
                if (masihRelevan) sudahTesBerhasil = true;
            } else {
                elTestResult.className = 'test-result failure';
                elTestResult.textContent = '✗ ' + hasil.pesan;
            }
        } catch (e) {
            elTestResult.className = 'test-result failure';
            elTestResult.textContent = '✗ Gagal menguji koneksi: ' + (e && e.message ? e.message : e);
        } finally {
            elBtnTest.disabled = false;
            elBtnTest.textContent = '\u{1F50C} Tes Koneksi';
            updateSaveGate();
        }
    });

    elBtnSave.addEventListener('click', () => {
        const { host, ctx, valid } = updatePreviewDanValidasi();
        if (!valid) {
            elError.textContent = 'Alamat host wajib diisi dan tidak boleh mengandung spasi.';
            elHost.focus();
            return;
        }
        elBtnSave.disabled = true;
        elBtnSave.textContent = 'Menyimpan…';
        window.setupAPI.saveConfig({ host: host, contextPath: ctx, https: elHttps.checked });
        // Tidak perlu menunggu balasan -- proses utama akan menutup jendela wizard ini sendiri
        // (lihat handler 'setup:save' di main.js) begitu konfigurasi tersimpan & jendela POS dibuka.
    });

    // Bila wizard dibuka ULANG untuk MENGUBAH pengaturan (bukan pengisian pertama kali), isi ulang
    // form dengan nilai yang sudah tersimpan supaya pengguna tidak perlu mengetik ulang dari nol.
    window.setupAPI.getCurrentConfig().then(cfg => {
        if (!cfg) { updatePreviewDanValidasi(); return; }
        elHost.value = cfg.host || '';
        elContextPath.value = cfg.contextPath || '';
        elHttps.checked = cfg.https !== false;
        updatePreviewDanValidasi();
    }).catch(() => { updatePreviewDanValidasi(); });

    elHost.focus();
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
