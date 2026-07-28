/**
 * pesanan-badge.js -- badge lingkaran merah pada item sidebar "Pesanan", menampilkan jumlah pesanan
 * online baru yang belum dilihat kasir. Dimuat di SEMUA halaman (pola sama seperti branding.js) supaya
 * badge tetap terlihat konsisten di halaman mana pun kasir sedang berada -- bukan cuma saat di Kasir,
 * yang sebelumnya hanya menampilkan popup {@code overlayPesananBaru} dan cuma aktif selama di pos.html.
 *
 * Desktop BUKAN SPA -- tiap klik menu memuat ulang seluruh halaman/JS, jadi variabel in-memory di
 * renderer manapun tak bisa dipakai menyimpan "berapa pesanan baru belum dilihat" lintas-halaman.
 * State itu (id tertinggi terakhir diketahui + akumulasi jumlah belum dilihat) disimpan di
 * localStorage, yang persisten sepanjang aplikasi terbuka (dan lintas-restart). Polling+baseline
 * mengikuti pola {@code cekPesananOnlineBaru} di pos-renderer.js: panggilan PERTAMA (belum pernah ada
 * state tersimpan) hanya merekam baseline, TIDAK menghitung sbg baru -- supaya instalasi baru tak
 * langsung menampilkan badge menggunung utk pesanan lama yg sudah menumpuk.
 *
 * Badge otomatis nol saat kasir benar-benar membuka pesanan.html (dianggap "sudah dilihat"), sama
 * seperti {@code tampilkanBadgePesananBaru(0)} pada versi Android saat pindah ke layarPesananOnline.
 */
(function () {
    var KUNCI_SEJAK_ID = 'pesananBaru.sejakId';
    var KUNCI_JUMLAH = 'pesananBaru.jumlah';
    var diHalamanPesanan = /(^|\/)pesanan\.html$/.test(window.location.pathname);

    /** Bunyi dua-nada pendek (Web Audio, TANPA berkas aset) -- pola sama beepSo() Android SO by Scan. */
    function bunyiPesananBaru() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            var ctx = new Ctx();
            [880, 1175].forEach((freq, i) => {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.14);
                osc.start(ctx.currentTime + i * 0.14);
                osc.stop(ctx.currentTime + i * 0.14 + 0.12);
                if (i === 1) osc.onended = () => { try { ctx.close(); } catch (e) { /* abaikan */ } };
            });
        } catch (e) { /* abaikan -- audio bukan jalur kritis */ }
    }

    /**
     * Notifikasi tingkat-OS (gap-closure "notifikasi lebih tegas, bukan cuma badge") -- Electron
     * mengimplementasikan Web Notification API native lewat pusat notifikasi OS (Windows Action
     * Center dst), TIDAK butuh IPC/izin tambahan krn ini API renderer standar, bukan Node API.
     * Diam-diam no-op bila platform/izin tak mendukung (mis. belum granted) -- badge tetap jalan.
     */
    function notifikasiOsPesananBaru(jumlahBaru) {
        try {
            if (typeof Notification === 'undefined') return;
            var tampilkan = () => {
                try {
                    var n = new Notification('Pesanan Online Baru', {
                        body: jumlahBaru + ' pesanan online baru menunggu diproses.',
                        silent: true // suara sudah ditangani bunyiPesananBaru() sendiri, hindari dobel
                    });
                    n.onclick = () => { try { window.focus(); } catch (e) { /* abaikan */ } };
                } catch (e) { /* abaikan */ }
            };
            if (Notification.permission === 'granted') tampilkan();
            else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then((p) => { if (p === 'granted') tampilkan(); });
            }
        } catch (e) { /* abaikan -- notifikasi OS bukan jalur kritis */ }
    }

    function ambilInt(kunci, default_) {
        var mentah = localStorage.getItem(kunci);
        if (mentah === null) return default_;
        var v = parseInt(mentah, 10);
        return isNaN(v) ? default_ : v;
    }

    function tampilkanBadge(n) {
        document.querySelectorAll('.sidebar .nav-item[href="pesanan.html"]').forEach((el) => {
            var badge = el.querySelector('.badge-pesanan-baru');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge-pesanan-baru';
                el.appendChild(badge);
            }
            if (n > 0) {
                badge.textContent = n > 99 ? '99+' : String(n);
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    async function cekPesananBaruBadge() {
        try {
            if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.pesananOnlineBaru) return;
            var sejakIdTersimpan = ambilInt(KUNCI_SEJAK_ID, null);
            var adalahBaseline = (sejakIdTersimpan === null);
            var tokoId = null;
            try {
                if (window.electronAPI.posAPI.konfigurasi) {
                    var rk = await window.electronAPI.posAPI.konfigurasi();
                    if (rk && rk.ok && rk.data) tokoId = rk.data.tokoId;
                }
            } catch (eKonfig) { /* kirim tanpa id_toko -- server anggap tak dibatasi toko */ }

            var r = await window.electronAPI.posAPI.pesananOnlineBaru({ id_toko: tokoId, sejak_id: sejakIdTersimpan || 0 });
            if (!r.ok || !r.data) return; // offline/gagal -- diam-diam dicoba lagi siklus berikutnya

            localStorage.setItem(KUNCI_SEJAK_ID, String(Number(r.data.maksId) || sejakIdTersimpan || 0));
            if (adalahBaseline) return;

            var daftarBaru = r.data.pesanan || [];
            if (daftarBaru.length === 0) return;
            var jumlahBaru = ambilInt(KUNCI_JUMLAH, 0) + daftarBaru.length;
            localStorage.setItem(KUNCI_JUMLAH, String(jumlahBaru));
            tampilkanBadge(jumlahBaru);
            if (!diHalamanPesanan) {
                // Di pesanan.html sendiri sudah jelas terlihat lewat daftar -- notifikasi/bunyi HANYA
                // perlu menginterupsi saat kasir sedang di layar LAIN (justru itu titik gap-closure-nya).
                bunyiPesananBaru();
                notifikasiOsPesananBaru(daftarBaru.length);
            }
        } catch (e) { /* diam-diam gagal, coba lagi siklus berikutnya */ }
    }

    function mulai() {
        if (diHalamanPesanan) {
            localStorage.setItem(KUNCI_JUMLAH, '0');
            tampilkanBadge(0);
        } else {
            tampilkanBadge(ambilInt(KUNCI_JUMLAH, 0));
        }
        cekPesananBaruBadge();
        setInterval(cekPesananBaruBadge, 20000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mulai);
    } else {
        mulai();
    }
})();
