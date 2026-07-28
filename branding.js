/**
 * branding.js -- terapkan "Tampilan Aplikasi" (judul jendela + logo sidebar) LOKAL ke halaman ini,
 * lihat JavaDoc {@code BRANDING_PATH}/{@code bacaBranding} di main.js. Dimuat di SEMUA halaman
 * (termasuk konfigurasi.html sendiri) SETELAH i18n.js tapi SEBELUM skrip renderer masing-masing --
 * menunggu event DOMContentLoaded (bukan dieksekusi langsung) supaya berjalan PALING TERAKHIR, setelah
 * i18n selesai menerjemahkan teks awal, sehingga judul kustom tidak tertimpa balik oleh kamus bahasa.
 *
 * Murni kosmetik: kegagalan (offline, berkas belum pernah diatur, IPC tak tersedia) dibiarkan diam --
 * halaman tetap tampil dgn judul/logo bawaan "POS Kasir".
 */
(function () {
    function terapkan(data) {
        if (!data) return;
        if (data.judulAplikasi) {
            document.title = document.title.replace(/^POS Kasir/, data.judulAplikasi);
            document.querySelectorAll('.sidebar .brand [data-i18n="POS Kasir"]').forEach((el) => {
                el.textContent = data.judulAplikasi;
            });
        }
        if (data.logoLokalPath) {
            document.querySelectorAll('.sidebar .brand .logo-dot').forEach((el) => {
                el.innerHTML = '';
                // .logo-dot sendiri berukuran tetap kecil (~30px) di CSS tiap halaman, TAPI itu cuma
                // menata KOTAKnya -- <img> yang disisipkan tanpa batas ukuran/object-fit akan tetap
                // dirender pada dimensi PIKSEL ASLI berkasnya (mis. foto potret beresolusi tinggi yang
                // dipilih via "Pilih Logo") dan MELUBERI kotak itu, merusak seluruh tata letak sidebar
                // -- bug nyata yang dilaporkan (ikon logo raksasa menutupi menu). Dipaksa lewat inline
                // style di sini (bukan mengandalkan CSS tiap halaman) supaya berlaku SERAGAM di semua
                // halaman yang memuat berkas ini, apa pun ukuran/rasio foto yang diunggah pengguna.
                el.style.overflow = 'hidden';
                const img = document.createElement('img');
                img.src = data.logoLokalPath;
                img.alt = '';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.display = 'block';
                el.appendChild(img);
            });
        }
    }

    async function muatDanTerapkan() {
        try {
            if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.branding) return;
            const r = await window.electronAPI.posAPI.branding.ambil();
            if (r && r.ok) terapkan(r.data);
        } catch (e) { /* abaikan -- lihat JavaDoc berkas ini */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', muatDanTerapkan);
    } else {
        muatDanTerapkan();
    }
})();
