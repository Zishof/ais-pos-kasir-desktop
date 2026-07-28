/**
 * login-renderer.js -- Logika layar login LOKAL (login.html). Berjalan di konteks renderer
 * terisolasi; satu-satunya jembatan ke proses utama adalah window.loginAPI (diekspos
 * preload-login.js). TIDAK ADA logika jaringan di sini -- otentikasi sesungguhnya (bicara ke
 * endpoint {@code /login?action=ajax_login} milik server) dilakukan di proses utama, lihat JavaDoc
 * {@code prosesLoginServer} di main.js untuk alasannya (menghindari CORS dari konteks file://).
 *
 * Alur 2 langkah: (1) form ID Pengguna/Kata Sandi biasa -> (2) begitu berhasil (manual ATAU
 * auto-login "Ingat Saya"), form disembunyikan dan digantikan langkah "Sinkronkan Data" (unduh
 * katalog+konfigurasi terbaru ke database lokal, lihat JavaDoc handler {@code login:sinkron-data} di
 * main.js) SEBELUM benar-benar masuk ke jendela kasir -- langkah ini opsional (ada tombol "Lewati").
 */
(function () {
    const elForm = document.getElementById('formLogin');
    const elUsername = document.getElementById('username');
    const elPassword = document.getElementById('password');
    const elRememberMe = document.getElementById('rememberMe');
    const elBtnMasuk = document.getElementById('btnMasuk');
    const elBtnTogglePassword = document.getElementById('btnTogglePassword');
    const elBtnUbahServer = document.getElementById('btnUbahServer');
    const elStatusBox = document.getElementById('statusBox');
    const elHostLabel = document.getElementById('hostLabel');
    const elJudulHeader = document.getElementById('judulHeader');

    const elPanelOffline = document.getElementById('panelOffline');
    const elKeteranganOffline = document.getElementById('keteranganOffline');
    const elPasswordOffline = document.getElementById('passwordOffline');
    const elBtnMasukOffline = document.getElementById('btnMasukOffline');
    const elPemisahAtau = document.getElementById('pemisahAtau');

    const elLangkahSinkron = document.getElementById('langkahSinkron');
    const elStatusBoxSinkron = document.getElementById('statusBoxSinkron');
    const elRingkasanSinkron = document.getElementById('ringkasanSinkron');
    const elBtnSinkronkanData = document.getElementById('btnSinkronkanData');
    const elBtnLewati = document.getElementById('btnLewati');

    function tampilkanStatus(kelas, pesan) {
        elStatusBox.className = 'status-box' + (kelas ? ' ' + kelas : '');
        elStatusBox.textContent = pesan || '';
    }

    function tampilkanStatusSinkron(kelas, pesan) {
        elStatusBoxSinkron.className = 'status-box' + (kelas ? ' ' + kelas : '');
        elStatusBoxSinkron.textContent = pesan || '';
    }

    /** Berpindah dari form login ke langkah "Sinkronkan Data" -- dipanggil setelah login SUKSES (manual maupun otomatis). */
    function pindahKeLangkahSinkron() {
        elForm.style.display = 'none';
        elJudulHeader.textContent = '\u{1F512} Masuk';
        elLangkahSinkron.className = 'langkah-sinkron tampil';
        elBtnSinkronkanData.focus();
    }

    elBtnTogglePassword.addEventListener('click', () => {
        const tampil = elPassword.type === 'password';
        elPassword.type = tampil ? 'text' : 'password';
        elBtnTogglePassword.textContent = tampil ? 'SEMBUNYI' : 'TAMPIL';
    });

    elBtnUbahServer.addEventListener('click', () => {
        window.loginAPI.ubahServer();
    });

    elForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = elUsername.value.trim();
        const password = elPassword.value;

        if (!username || !password) {
            tampilkanStatus('failure', 'ID Pengguna dan Kata Sandi wajib diisi.');
            (username ? elPassword : elUsername).focus();
            return;
        }

        elBtnMasuk.disabled = true;
        elBtnMasuk.textContent = 'Memverifikasi…';
        tampilkanStatus('testing', 'Memverifikasi akun ke server, mohon tunggu…');

        try {
            const hasil = await window.loginAPI.submit({ username: username, password: password, rememberMe: elRememberMe.checked });
            if (hasil.ok) {
                pindahKeLangkahSinkron();
            } else {
                tampilkanStatus('failure', '✗ ' + (hasil.pesan || 'Nama pengguna atau kata sandi tidak valid.'));
                elBtnMasuk.disabled = false;
                elBtnMasuk.textContent = 'Masuk';
                elPassword.focus();
                elPassword.select();
            }
        } catch (e) {
            tampilkanStatus('failure', '✗ Gagal memproses login: ' + (e && e.message ? e.message : e));
            elBtnMasuk.disabled = false;
            elBtnMasuk.textContent = 'Masuk';
        }
    });

    window.loginAPI.getServerHost().then((ctx) => {
        elHostLabel.textContent = (ctx && ctx.host) ? ('Server: ' + ctx.host) : 'Alamat server belum diatur';
    }).catch(() => { elHostLabel.textContent = ''; });

    /**
     * Mencoba login diam-diam pakai kredensial "Ingat Saya" tersimpan, dipanggil SEKALI saat
     * halaman ini pertama dimuat -- lihat JavaDoc lengkap {@code login:coba-auto} di main.js.
     * Form dinonaktifkan sementara supaya pengguna tak submit manual di tengah percobaan diam-diam
     * (mencegah dua permintaan login nyasar bersamaan).
     */
    async function cobaAutoLoginTersimpan() {
        elBtnMasuk.disabled = true;
        elUsername.disabled = true;
        elPassword.disabled = true;
        tampilkanStatus('testing', 'Memeriksa akun yang diingat…');

        try {
            const hasil = await window.loginAPI.cobaAutoLogin();
            if (!hasil || !hasil.tried) {
                tampilkanStatus('', ''); // tak ada yg tersimpan -- form login manual tampil bersih spt biasa.
            } else if (hasil.ok) {
                pindahKeLangkahSinkron();
                return; // form tak perlu diaktifkan lagi -- sudah berpindah ke langkah sinkron.
            } else if (hasil.offline && hasil.bisaOfflineLogin) {
                // Server tak terjangkau TAPI ada hash "Login Mode Offline" tersimpan utk akun ini --
                // tawarkan jalur offline alih-alih pesan "sesi tak berlaku" yg menyesatkan (kredensial
                // sebenarnya masih valid, cuma jaringannya yg bermasalah). Lihat JavaDoc lengkap
                // handler login:coba-auto/login:coba-offline di main.js.
                if (hasil.username) elUsername.value = hasil.username;
                tampilkanKeadaanOffline(hasil.username);
                tampilkanStatus('', '');
            } else if (hasil.offline) {
                // Server tak terjangkau dan TIDAK ada hash offline tersimpan (akun ini belum pernah
                // login online dgn "Ingat akun saya" di perangkat ini) -- tak ada jalur offline yg bisa
                // ditawarkan, kembali ke form manual dgn pesan yg jujur (bukan "kata sandi salah").
                if (hasil.username) elUsername.value = hasil.username;
                tampilkanStatus('failure', 'Server tidak terjangkau, dan belum ada akun yang pernah "Diingat" di perangkat ini untuk Mode Offline.');
            } else {
                if (hasil.username) elUsername.value = hasil.username;
                tampilkanStatus('failure', 'Sesi tersimpan sudah tidak berlaku -- silakan masuk kembali.');
            }
        } catch (e) {
            tampilkanStatus('', '');
        }

        elBtnMasuk.disabled = false;
        elUsername.disabled = false;
        elPassword.disabled = false;
        (elUsername.value ? elPassword : elUsername).focus();
    }

    /** Menampilkan panel "Masuk Mode Offline" di atas form login manual (yg tetap tersedia sbg alternatif). */
    function tampilkanKeadaanOffline(username) {
        elKeteranganOffline.textContent = (window.Kamus ? window.Kamus.t('Anda bisa tetap masuk dalam Mode Offline memakai akun yang diingat di perangkat ini. Transaksi akan disinkronkan otomatis begitu koneksi pulih.') : elKeteranganOffline.textContent)
            + (username ? ' (' + username + ')' : '');
        elPanelOffline.className = 'panel-offline tampil';
        elPemisahAtau.style.display = '';
        elPasswordOffline.focus();
    }

    elBtnMasukOffline.addEventListener('click', async () => {
        const password = elPasswordOffline.value;
        if (!password) { elPasswordOffline.focus(); return; }

        elBtnMasukOffline.disabled = true;
        elBtnMasukOffline.textContent = 'Memverifikasi…';
        tampilkanStatus('', '');

        try {
            const hasil = await window.loginAPI.cobaOfflineLogin({ username: elUsername.value.trim(), password: password });
            if (hasil.ok) {
                // Jendela login akan ditutup sendiri oleh proses utama (langsung ke Kasir, Mode
                // Offline melewati langkah "Sinkronkan Data" -- lihat JavaDoc login:coba-offline).
                elBtnMasukOffline.textContent = 'Membuka Kasir…';
                return;
            }
            tampilkanStatus('failure', '✗ ' + (hasil.pesan || 'Kata sandi salah.'));
            elBtnMasukOffline.disabled = false;
            elBtnMasukOffline.textContent = 'Masuk Mode Offline';
            elPasswordOffline.focus();
            elPasswordOffline.select();
        } catch (e) {
            tampilkanStatus('failure', '✗ Gagal memproses login offline: ' + (e && e.message ? e.message : e));
            elBtnMasukOffline.disabled = false;
            elBtnMasukOffline.textContent = 'Masuk Mode Offline';
        }
    });

    // ==== Langkah "Sinkronkan Data" ====

    /** true setelah sinkronisasi berhasil -- mengubah arti tombol utama dari "coba sinkron" jadi "lanjutkan". */
    let sinkronSudahSukses = false;

    elBtnSinkronkanData.addEventListener('click', async () => {
        if (sinkronSudahSukses) {
            lanjutkanKeKasir();
            return;
        }

        elBtnSinkronkanData.disabled = true;
        elBtnLewati.disabled = true;
        elBtnSinkronkanData.textContent = 'Menyinkronkan…';
        elRingkasanSinkron.className = 'ringkasan-sinkron';
        tampilkanStatusSinkron('testing', 'Mengunduh katalog produk & konfigurasi terbaru…');

        try {
            const hasil = await window.loginAPI.sinkronkanData();
            if (hasil.ok) {
                sinkronSudahSukses = true;
                tampilkanStatusSinkron('success', '✓ Data berhasil disinkronkan.');
                elRingkasanSinkron.className = 'ringkasan-sinkron tampil';
                elRingkasanSinkron.textContent = (hasil.jumlahProduk || 0) + ' produk dan ' + (hasil.jumlahKategori || 0) + ' kategori tersimpan ke perangkat ini -- siap dipakai walau nanti internet terputus.';
                elBtnSinkronkanData.textContent = 'Lanjutkan ke Kasir';
                elBtnSinkronkanData.disabled = false;
                elBtnLewati.style.display = 'none';
            } else {
                tampilkanStatusSinkron('failure', '✗ ' + (hasil.pesan || 'Gagal menyinkronkan data.'));
                elBtnSinkronkanData.textContent = 'Coba Lagi';
                elBtnSinkronkanData.disabled = false;
                elBtnLewati.disabled = false;
            }
        } catch (e) {
            tampilkanStatusSinkron('failure', '✗ Gagal menyinkronkan data: ' + (e && e.message ? e.message : e));
            elBtnSinkronkanData.textContent = 'Coba Lagi';
            elBtnSinkronkanData.disabled = false;
            elBtnLewati.disabled = false;
        }
    });

    elBtnLewati.addEventListener('click', () => { lanjutkanKeKasir(); });

    async function lanjutkanKeKasir() {
        elBtnSinkronkanData.disabled = true;
        elBtnLewati.disabled = true;
        elBtnSinkronkanData.textContent = 'Membuka aplikasi kasir…';
        try {
            await window.loginAPI.selesai();
            // Jendela ini akan ditutup sendiri oleh proses utama sesaat lagi -- tak perlu aksi lanjutan.
        } catch (e) {
            tampilkanStatusSinkron('failure', '✗ Gagal membuka aplikasi kasir: ' + (e && e.message ? e.message : e));
            elBtnSinkronkanData.disabled = false;
            elBtnLewati.disabled = false;
            elBtnSinkronkanData.textContent = sinkronSudahSukses ? 'Lanjutkan ke Kasir' : 'Sinkronkan Data';
        }
    }

    cobaAutoLoginTersimpan();
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
