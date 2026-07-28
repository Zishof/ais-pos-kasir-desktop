/**
 * pesan-detail.js -- Modul BERSAMA (dimuat pos.html/pesanan.html/ringkasan.html lewat <script>) yang
 * menerjemahkan hasil panggilan window.electronAPI.posAPI.* (bentuk {ok, offline?, pesan?, kode?,
 * butuhLoginUlang?}) menjadi penjelasan LENGKAP utk kasir: apa yang terjadi, kenapa, langkah yang
 * perlu dilakukan SEKARANG, dan cara mencegahnya terulang -- ditampilkan lewat modal (bukan toast
 * 3-detik yang terlalu singkat utk dibaca) memakai token desain (--primary/--danger/dst.) milik
 * halaman pemanggil, jadi TIDAK perlu <style>/markup tambahan di tiap berkas HTML -- semuanya
 * di-suntik sendiri oleh modul ini sekali saat pertama dipanggil.
 *
 * LATAR BELAKANG (kenapa modul ini dibuat): sebelumnya seluruh kegagalan checkout ditampilkan sbg
 * toast generik "Permintaan ditolak server." -- SAMPAI ditemukan bug nyata (lihat JavaDoc
 * PosApi.normalisasiStatusKantinHelper di server) bahwa toast itu bisa muncul BAHKAN SAAT TRANSAKSI
 * SEBENARNYA BERHASIL, krn ketidakcocokan konvensi status antara KantinHelper (kode angka "00"/"91")
 * dan pengecekan klien (literal "success"). Setelah bug itu diperbaiki di server, modul ini
 * menambahkan lapis PENJELASAN supaya kasir tidak lagi menebak-nebak arti sebuah error.
 *
 * Dictionary dicocokkan lewat field terstruktur ({@code kode}, {@code offline}, {@code butuhLoginUlang})
 * SEDAPAT MUNGKIN -- BUKAN menebak dari teks bebas -- krn field bebas ({@code pesan}) bisa berubah
 * kapan saja tanpa kontrak jelas. Kode yg dikenali datang dari 2 sumber: SERVER (PosApi, lihat
 * {@code normalisasiStatusKantinHelper}: DUPLIKAT_KODE_TRANSAKSI/TIDAK_DITEMUKAN/DATA_TIDAK_LENGKAP/
 * SERVER_ERROR) dan KLIEN sendiri (pos-renderer.js gerbangSaldoDanPin: MEMBER_BELUM_DIPILIH/
 * SALDO_TIDAK_CUKUP/dst. -- lihat komentar di sana).
 */
(function () {
    // ==== Kamus: kode -> {judul, penjelasan, langkah[], pencegahan[], tingkat} ====
    // tingkat: 'error' (merah, gagal total) | 'peringatan' (kuning, perlu perhatian tapi tak fatal)
    //          | 'info' (biru, sekadar informasi).
    const KAMUS = {
        OFFLINE_CHECKOUT: {
            tingkat: 'peringatan',
            judul: 'Tersimpan Offline -- Belum Terkirim ke Server',
            penjelasan: 'Perangkat ini sedang TIDAK terhubung ke internet/server. Transaksi TETAP tercatat aman di penyimpanan lokal perangkat ini (tidak hilang), tapi BELUM tersinkron ke database pusat -- laporan/dashboard di server belum akan menampilkan transaksi ini sampai berhasil disinkronkan.',
            langkah: [
                'Lanjutkan melayani pelanggan seperti biasa -- struk/uang tetap sah, tidak perlu membatalkan transaksi ini.',
                'Periksa koneksi internet perangkat (WiFi/kabel LAN) begitu ada kesempatan.',
                'Setelah koneksi kembali, klik tombol "Sinkronkan" di pojok kanan atas -- atau tunggu, aplikasi akan mencoba menyinkronkan otomatis.',
                'Pastikan badge "X belum sinkron" di pojok kiri bawah akhirnya hilang/berkurang -- itu tandanya transaksi sudah benar-benar tersimpan di server.'
            ],
            pencegahan: [
                'Cek indikator status koneksi (lingkaran hijau/merah di pojok kiri bawah) SEBELUM mulai melayani antrean panjang.',
                'Jangan matikan/tutup aplikasi selagi ada transaksi "belum sinkron" -- data tetap aman di perangkat, tapi lebih mudah dipantau bila aplikasi tetap terbuka.',
                'Laporkan ke admin/IT bila koneksi sering putus -- ini bisa jadi tanda masalah jaringan toko yang perlu diperbaiki.'
            ]
        },
        SUKSES_ONLINE: {
            tingkat: 'info',
            judul: 'Transaksi Berhasil & Tersinkron',
            penjelasan: 'Transaksi sudah dikirim dan disimpan LANGSUNG di server pusat -- stok, saldo member (bila dipakai), dan laporan sudah ter-update saat ini juga.',
            langkah: ['Berikan struk/konfirmasi ke pelanggan seperti biasa.'],
            pencegahan: []
        },

        SESI_KEDALUWARSA: {
            tingkat: 'error',
            judul: 'Sesi Kasir Berakhir -- Wajib Masuk Ulang',
            penjelasan: 'Sesi login perangkat ini sudah tidak berlaku lagi di server (kedaluwarsa, atau dicabut dari sisi admin). Permintaan ini DITOLAK server sebelum sempat diproses sama sekali -- BUKAN karena data transaksinya salah.',
            langkah: [
                'Klik "Masuk Kembali" (atau tutup lalu buka ulang aplikasi) untuk login ulang dengan akun kasir.',
                'Setelah berhasil masuk, ulangi transaksi yang tadi gagal -- transaksi TIDAK tersimpan di server sama sekali saat sesi kedaluwarsa, jadi aman diulang tanpa risiko dobel.'
            ],
            pencegahan: [
                'Aktifkan "Ingat Saya" saat login supaya sesi bertahan lebih lama dan tidak sering kedaluwarsa mendadak di tengah antrean pelanggan.',
                'Hindari membuka aplikasi ini dengan akun yang sama di lebih dari satu perangkat sekaligus -- bisa memicu sesi salah satunya dicabut otomatis.'
            ]
        },
        ALAMAT_SERVER_BELUM_DIATUR: {
            tingkat: 'error',
            judul: 'Alamat Server Belum Diatur',
            penjelasan: 'Aplikasi ini belum tahu harus menghubungi server yang mana -- pengaturan alamat server (host/context path) di perangkat ini kosong atau belum tersimpan.',
            langkah: [
                'Buka menu Pengaturan Server dari aplikasi (biasanya lewat jendela login/menu aplikasi) dan isi alamat host + context path yang benar.',
                'Gunakan tombol "Tes Koneksi" di wizard pengaturan sebelum menyimpan -- pastikan hasilnya berhasil dulu.'
            ],
            pencegahan: [
                'Jangan hapus/reset data aplikasi (folder data pengguna) kecuali memang berniat mengatur ulang dari awal -- itu akan menghapus pengaturan alamat server ini juga.',
                'Catat alamat server yang benar di tempat aman (mis. label di perangkat) supaya mudah diisi ulang bila perlu instal ulang.'
            ]
        },

        MEMBER_BELUM_DIPILIH: {
            tingkat: 'peringatan',
            judul: 'Member Belum Dipilih',
            penjelasan: 'Metode pembayaran "Saldo" HARUS terkait ke satu member/anggota koperasi tertentu -- saldo dipotong dari akun member itu, jadi sistem perlu tahu member mana yang membayar.',
            langkah: [
                'Ketik nama atau kode member pelanggan di kotak pencarian "Cari member" pada panel Keranjang.',
                'Pilih member yang benar dari daftar hasil pencarian yang muncul.',
                'Klik tombol Bayar lagi setelah member terpilih (akan tampil sebagai chip biru di atas ringkasan total).'
            ],
            pencegahan: [
                'Pilih member DULU sebelum membuka modal Metode Pembayaran, supaya urutannya lebih alami dan tidak lupa.',
                'Bila pelanggan tidak punya akun member, pilih metode pembayaran lain (Tunai/QRIS/dst.) yang tidak butuh member.'
            ]
        },
        SALDO_TIDAK_CUKUP: {
            tingkat: 'peringatan',
            judul: 'Saldo Member Tidak Cukup',
            penjelasan: 'Saldo TERKINI member yang dipilih (dihitung ulang LANGSUNG dari server, bukan angka lama) lebih kecil dari total belanja saat ini -- transaksi DIBATALKAN SEBELUM dikirim ke server, jadi TIDAK ada saldo yang berkurang maupun barang yang tercatat terjual.',
            langkah: [
                'Beri tahu pelanggan bahwa saldo tidak mencukupi untuk transaksi ini.',
                'Tawarkan opsi: kurangi jumlah belanja, minta pelanggan top-up saldo dulu, atau gunakan metode pembayaran lain (Tunai/QRIS/dst.) untuk sebagian/seluruh belanja.',
                'Setelah disepakati, sesuaikan keranjang atau ganti metode pembayaran, lalu klik Bayar lagi.'
            ],
            pencegahan: [
                'Untuk pelanggan langganan dengan saldo pas-pasan, cek saldo lebih dulu (mis. lewat menu member) sebelum mulai memindai banyak barang.',
                'Ingatkan member untuk top-up saldo secara berkala agar tidak kehabisan saat jam sibuk.'
            ]
        },
        SALDO_MENGENDAP_KURANG: {
            tingkat: 'peringatan',
            judul: 'Saldo Tersisa Akan di Bawah Batas Minimal',
            penjelasan: 'Jenis keanggotaan member ini punya aturan "saldo minimal mengendap" (saldo tidak boleh habis total, harus selalu menyisakan jumlah minimal tertentu setelah transaksi). Jika transaksi ini diteruskan, saldo yang tersisa akan berada DI BAWAH batas minimal itu -- jadi transaksi ini DIBATALKAN SEBELUM dikirim ke server.',
            langkah: [
                'Beri tahu pelanggan aturan saldo minimal yang berlaku untuk jenis keanggotaannya.',
                'Kurangi jumlah belanja agar saldo tersisa tetap di atas batas minimal, ATAU gunakan metode pembayaran lain untuk sebagian/seluruh belanja.',
                'Klik Bayar lagi setelah disesuaikan.'
            ],
            pencegahan: [
                'Aturan saldo minimal ini diatur admin per jenis keanggotaan -- hubungi admin bila menurut Anda batasnya perlu ditinjau ulang.'
            ]
        },
        GAGAL_CEK_SALDO: {
            tingkat: 'error',
            judul: 'Gagal Memeriksa Saldo Member',
            penjelasan: 'Aplikasi tidak berhasil mengambil angka saldo TERKINI dari server sebelum melanjutkan pembayaran -- pemeriksaan saldo WAJIB berhasil dulu (bukan pakai angka lama) supaya tidak salah memotong saldo. Transaksi ini DIBATALKAN, TIDAK ada yang tersimpan.',
            langkah: [
                'Periksa koneksi internet perangkat.',
                'Coba klik Bayar sekali lagi setelah beberapa detik.',
                'Bila terus gagal, hubungi admin/IT -- kemungkinan ada gangguan pada server.'
            ],
            pencegahan: ['Pastikan indikator koneksi hijau (Sesi Aktif) sebelum memproses pembayaran pakai Saldo -- metode ini SELALU butuh koneksi aktif, tidak bisa dipakai offline.']
        },
        PIN_DIBATALKAN: {
            tingkat: 'peringatan',
            judul: 'Verifikasi PIN Dibatalkan',
            penjelasan: 'Pelanggan (atau kasir) menekan tombol "Batalkan" di layar PIN pada Layar Pelanggan sebelum PIN berhasil diverifikasi. Transaksi ini DIHENTIKAN, TIDAK ada saldo yang dipotong maupun barang yang tercatat terjual.',
            langkah: [
                'Tanyakan ke pelanggan apakah ingin mencoba lagi (mis. tadi salah pencet/berubah pikiran).',
                'Bila ingin mengulang: klik Bayar lagi -- permintaan PIN baru akan dikirim ke Layar Pelanggan.',
                'Bila tidak jadi pakai Saldo, ganti metode pembayaran ke Tunai/QRIS/dst.'
            ],
            pencegahan: ['Ingatkan pelanggan untuk menekan tombol "OK" (bukan "Batalkan") setelah selesai mengetik PIN di numpad.']
        },
        PIN_TIMEOUT: {
            tingkat: 'peringatan',
            judul: 'Waktu Verifikasi PIN Habis',
            penjelasan: 'Sistem menunggu maksimal 90 detik untuk PIN diketik & diverifikasi di Layar Pelanggan -- karena tidak ada respons dalam waktu itu, transaksi ini OTOMATIS DIBATALKAN sebagai langkah pengaman (mencegah transaksi menggantung tanpa batas waktu). TIDAK ada saldo yang dipotong.',
            langkah: [
                'Pastikan pelanggan sadar diminta memasukkan PIN di Layar Pelanggan (monitor kedua).',
                'Klik Bayar lagi untuk mengirim ulang permintaan PIN dengan waktu tunggu baru.'
            ],
            pencegahan: [
                'Posisikan Layar Pelanggan menghadap pelanggan dengan jelas sebelum memproses pembayaran Saldo, supaya pelanggan langsung sadar saat diminta PIN.',
                'Arahkan pelanggan lebih cepat mengetik PIN saat jam sibuk untuk menghindari antrean menumpuk akibat timeout berulang.'
            ]
        },

        DUPLIKAT_KODE_TRANSAKSI: {
            tingkat: 'error',
            judul: 'Kemungkinan Transaksi Ini SUDAH Berhasil Sebelumnya',
            penjelasan: 'Server menolak permintaan ini karena kode transaksi yang dikirim SUDAH ADA di database -- ini biasanya terjadi saat percobaan pembayaran yang SAMA dikirim dua kali (mis. tadi sempat menekan Bayar, mendapat pesan error, lalu mencoba lagi -- padahal percobaan PERTAMA sebenarnya sudah berhasil tersimpan).',
            langkah: [
                'JANGAN menekan tombol Bayar lagi untuk transaksi/keranjang yang SAMA -- risiko tercatat DUA KALI.',
                'Buka menu "Buka Aplikasi Lengkap (Online)" dari aplikasi ini, lalu cek riwayat transaksi terbaru toko untuk memastikan apakah transaksi ini sudah tercatat.',
                'Bila SUDAH tercatat: transaksi ini aman, mulai transaksi BARU untuk pelanggan berikutnya (klik "Transaksi Baru").',
                'Bila TERNYATA belum tercatat (jarang terjadi): hubungi admin/IT untuk pengecekan lebih lanjut sebelum mencoba lagi.'
            ],
            pencegahan: [
                'Tunggu respons aplikasi selesai sepenuhnya (tombol Bayar berhenti berputar/berubah teks) sebelum menekan Bayar lagi -- jangan menekan berkali-kali karena terasa lambat.',
                'Bila muncul pesan error pada checkout, PERIKSA riwayat transaksi dulu sebelum mengulang, terutama bila tidak yakin apakah percobaan sebelumnya benar-benar gagal.'
            ]
        },
        DATA_TIDAK_LENGKAP: {
            tingkat: 'error',
            judul: 'Data Transaksi Tidak Lengkap/Tidak Valid',
            penjelasan: 'Server menolak permintaan ini karena ada data wajib yang kosong atau tidak valid (mis. informasi toko tidak dikenali) -- ini BUKAN soal stok/saldo, melainkan data transaksi itu sendiri yang bermasalah. Transaksi TIDAK diproses sama sekali, TIDAK ada perubahan di database.',
            langkah: [
                'Coba klik Bayar sekali lagi -- kadang ini disebabkan gangguan sesaat saat mengirim data.',
                'Bila terus terjadi, tutup dan buka ulang aplikasi, lalu masuk kembali dan ulangi transaksi.',
                'Bila masih gagal setelah itu, hubungi admin/IT dan sebutkan pesan ini beserta waktu kejadian.'
            ],
            pencegahan: ['Pastikan aplikasi dalam versi terbaru -- masalah data tidak lengkap biasanya sudah diperbaiki di update berikutnya bila ini pola yang berulang.']
        },
        SERVER_ERROR: {
            tingkat: 'error',
            judul: 'Transaksi Ditolak Server',
            penjelasan: 'Server menolak permintaan ini karena kesalahan yang tidak terduga saat memprosesnya. Detail teknis penyebabnya disertakan di bawah (bisa ditunjukkan ke admin/IT bila perlu bantuan lebih lanjut).',
            langkah: [
                'Coba klik Bayar sekali lagi -- sebagian error jenis ini bersifat sementara.',
                'Bila pesan yang SAMA terus muncul, JANGAN mencoba berkali-kali -- catat/screenshot pesan ini dan hubungi admin/IT.',
                'Sambil menunggu, pelanggan bisa dilayani dulu dengan mencatat manual (nota tulis tangan) supaya tidak menahan antrean.'
            ],
            pencegahan: ['Laporkan pola error yang sering berulang ke admin/IT walau sudah berhasil diatasi dgn mencoba lagi -- ini membantu menemukan akar masalah di server.']
        },
        TIDAK_DITEMUKAN: {
            tingkat: 'info',
            judul: 'Pembayaran Belum Terkonfirmasi',
            penjelasan: 'Server belum menerima konfirmasi pelunasan dari kanal pembayaran (mis. pelanggan belum selesai scan QRIS/transfer). Ini KEADAAN NORMAL selagi menunggu -- bukan berarti transaksi gagal.',
            langkah: ['Tunggu beberapa saat, aplikasi akan memeriksa ulang secara otomatis.', 'Pastikan pelanggan benar-benar sudah menyelesaikan pembayaran di aplikasi/perangkatnya.'],
            pencegahan: []
        },

        _DEFAULT_ERROR: {
            tingkat: 'error',
            judul: 'Permintaan Gagal Diproses',
            penjelasan: 'Terjadi kegagalan yang belum punya penjelasan khusus di aplikasi ini. Pesan asli dari sistem ditampilkan di bawah.',
            langkah: [
                'Coba ulangi tindakan yang tadi dilakukan.',
                'Bila terus gagal, catat/screenshot pesan ini dan hubungi admin/IT.'
            ],
            pencegahan: []
        }
    };

    // ==== Suntik style + markup modal SEKALI saja, dipanggil lazy saat tampilkan() pertama ====
    let sudahDisuntik = false;
    let elOverlay, elJudul, elIkon, elPenjelasan, elBlokLangkah, elLangkah, elBlokPencegahan,
        elPencegahan, elBlokTeknis, elTeknis, elToggleTeknis, elBtnOk, elBtnTutup, elBtnAksi, elModal,
        elBtnSalin, elBtnLapor;
    let teksTeknisSaatIni = '', judulTeknisSaatIni = '';

    function suntikSekaliJalan() {
        if (sudahDisuntik) return;
        sudahDisuntik = true;

        const style = document.createElement('style');
        style.textContent = `
            .pd-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.6); display: none; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
            .pd-overlay.tampil { display: flex; }
            .pd-modal { background: var(--surface, #fff); border-radius: 18px; width: 460px; max-width: 100%; max-height: 88vh; overflow-y: auto; box-shadow: var(--shadow-lg, 0 16px 40px rgba(15,23,42,.16)); }
            .pd-kepala { display: flex; align-items: flex-start; gap: 12px; padding: 20px 20px 14px; border-bottom: 1px solid var(--border, #e2e8f0); }
            .pd-ikon { font-size: 26px; flex-shrink: 0; line-height: 1; margin-top: 2px; }
            .pd-kepala h3 { margin: 0 0 3px; font-size: 16px; font-weight: 800; color: var(--ink, #1e293b); }
            .pd-sub { font-size: 12px; color: var(--muted, #64748b); }
            .pd-tutup { margin-left: auto; background: none; border: none; font-size: 15px; cursor: pointer; color: var(--muted, #64748b); padding: 4px; flex-shrink: 0; }
            .pd-body { padding: 16px 20px 4px; }
            .pd-penjelasan { font-size: 13px; line-height: 1.6; color: var(--ink, #1e293b); margin-bottom: 16px; }
            .pd-blok { margin-bottom: 16px; }
            .pd-blok h4 { margin: 0 0 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--muted, #64748b); }
            .pd-blok ol, .pd-blok ul { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.7; color: var(--ink, #1e293b); }
            .pd-blok li { margin-bottom: 4px; }
            .pd-teknis { margin-bottom: 16px; }
            .pd-teknis button { background: none; border: none; color: var(--muted, #64748b); font-size: 11.5px; cursor: pointer; padding: 4px 0; font-weight: 700; }
            .pd-teknis pre { display: none; white-space: pre-wrap; word-break: break-word; background: var(--bg, #f1f5f9); border-radius: 8px; padding: 10px 12px; font-size: 11px; color: var(--muted, #64748b); margin: 6px 0 0; max-height: 120px; overflow-y: auto; }
            .pd-teknis.terbuka pre { display: block; }
            .pd-footer { padding: 14px 20px 20px; display: flex; flex-direction: column; gap: 8px; }
            .pd-btn-ok { width: 100%; padding: 12px; border: none; border-radius: 11px; font-size: 13.5px; font-weight: 800; cursor: pointer; color: #fff; }
            .pd-tingkat-error .pd-btn-ok { background: var(--danger, #dc2626); }
            .pd-tingkat-peringatan .pd-btn-ok { background: var(--warning, #d97706); }
            .pd-tingkat-info .pd-btn-ok { background: var(--primary, #2563eb); }
            .pd-btn-aksi { width: 100%; padding: 12px; border-radius: 11px; font-size: 13.5px; font-weight: 800; cursor: pointer; background: var(--surface, #fff); }
            .pd-tingkat-error .pd-btn-aksi { border: 1.5px solid var(--danger, #dc2626); color: var(--danger, #dc2626); }
            .pd-tingkat-peringatan .pd-btn-aksi { border: 1.5px solid var(--warning, #d97706); color: var(--warning, #d97706); }
            .pd-tingkat-info .pd-btn-aksi { border: 1.5px solid var(--primary, #2563eb); color: var(--primary, #2563eb); }
            .pd-btn-salin, .pd-btn-lapor { width: 100%; padding: 11px; border-radius: 11px; font-size: 12.5px; font-weight: 700; cursor: pointer; background: var(--surface, #fff); border: 1.5px solid var(--border, #e2e8f0); color: var(--ink, #1e293b); }
        `;
        document.head.appendChild(style);

        elOverlay = document.createElement('div');
        elOverlay.className = 'pd-overlay';
        elOverlay.innerHTML =
            '<div class="pd-modal">' +
            '  <div class="pd-kepala"><span class="pd-ikon"></span><div><h3></h3><div class="pd-sub"></div></div><button type="button" class="pd-tutup">&#10005;</button></div>' +
            '  <div class="pd-body">' +
            '    <div class="pd-penjelasan"></div>' +
            '    <div class="pd-blok pd-blok-langkah"><h4>Langkah yang perlu dilakukan</h4><ol></ol></div>' +
            '    <div class="pd-blok pd-blok-pencegahan"><h4>Cara mencegah ke depannya</h4><ul></ul></div>' +
            '    <div class="pd-teknis"><button type="button">Tampilkan detail teknis &#9662;</button><pre></pre></div>' +
            '  </div>' +
            '  <div class="pd-footer">' +
            '    <button type="button" class="pd-btn-aksi" style="display:none;"></button>' +
            '    <button type="button" class="pd-btn-lapor">\u{1F41B} Laporkan ke GitHub</button>' +
            '    <button type="button" class="pd-btn-salin">\u{1F4CB} Salin Detail</button>' +
            '    <button type="button" class="pd-btn-ok">Mengerti</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(elOverlay);

        elModal = elOverlay.querySelector('.pd-modal');
        elIkon = elOverlay.querySelector('.pd-ikon');
        elJudul = elOverlay.querySelector('h3');
        elPenjelasan = elOverlay.querySelector('.pd-penjelasan');
        elBlokLangkah = elOverlay.querySelector('.pd-blok-langkah');
        elLangkah = elBlokLangkah.querySelector('ol');
        elBlokPencegahan = elOverlay.querySelector('.pd-blok-pencegahan');
        elPencegahan = elBlokPencegahan.querySelector('ul');
        elBlokTeknis = elOverlay.querySelector('.pd-teknis');
        elTeknis = elBlokTeknis.querySelector('pre');
        elToggleTeknis = elBlokTeknis.querySelector('button');
        elBtnOk = elOverlay.querySelector('.pd-btn-ok');
        elBtnTutup = elOverlay.querySelector('.pd-tutup');
        elBtnAksi = elOverlay.querySelector('.pd-btn-aksi');
        elBtnSalin = elOverlay.querySelector('.pd-btn-salin');
        elBtnLapor = elOverlay.querySelector('.pd-btn-lapor');

        function tutup() { elOverlay.className = 'pd-overlay'; }
        elBtnOk.addEventListener('click', tutup);
        elBtnTutup.addEventListener('click', tutup);
        elOverlay.addEventListener('click', (e) => { if (e.target === elOverlay) tutup(); });
        elToggleTeknis.addEventListener('click', () => {
            elBlokTeknis.classList.toggle('terbuka');
            elToggleTeknis.innerHTML = elBlokTeknis.classList.contains('terbuka')
                ? 'Sembunyikan detail teknis &#9652;' : 'Tampilkan detail teknis &#9662;';
        });

        elBtnSalin.addEventListener('click', () => {
            salinKeClipboard('[' + judulTeknisSaatIni + ']\n\n' + teksTeknisSaatIni);
        });
        elBtnLapor.addEventListener('click', () => {
            const badan = '**Aplikasi:** AIS POS Kasir Desktop\n'
                + '**Waktu:** ' + new Date().toString() + '\n\n'
                + '**Deskripsi masalah (isi oleh pengguna):**\n_(jelaskan apa yang sedang Anda lakukan saat error ini muncul)_\n\n'
                + '**Detail teknis:**\n```\n' + teksTeknisSaatIni + '\n```';
            bukaIssueGitHub('[Error] ' + judulTeknisSaatIni, badan);
        });
    }

    /**
     * Salin teks ke clipboard sistem, dengan fallback execCommand bila {@code navigator.clipboard}
     * tak tersedia (jendela tanpa fokus, dsb). Kegagalan diam-diam dicatat via console -- menyalin
     * teks BUKAN aksi kritikal, tidak perlu modal error sendiri utk ini.
     */
    function salinKeClipboard(teks) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(teks).catch(() => salinFallback(teks));
        } else {
            salinFallback(teks);
        }
    }
    function salinFallback(teks) {
        try {
            const ta = document.createElement('textarea');
            ta.value = teks; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.focus(); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) { console.warn('Gagal menyalin ke clipboard', e); }
    }

    /**
     * Buka form "Issue baru" GitHub SUDAH TERISI (judul+badan) di browser sistem eksternal, lewat
     * {@code window.electronAPI.bukaLinkEksternal} (bridge IPC yg SUDAH ADA, hanya menerima URL
     * berskema https://, lihat main.js). TIDAK mengirim apa pun secara otomatis -- pengguna tetap
     * harus meninjau & menekan "Submit new issue" sendiri di browser.
     */
    function bukaIssueGitHub(judul, badan) {
        const url = 'https://github.com/Zishof/ais-pos-kasir-desktop/issues/new?labels=bug&title='
            + encodeURIComponent(judul) + '&body=' + encodeURIComponent(badan);
        if (window.electronAPI && typeof window.electronAPI.bukaLinkEksternal === 'function') {
            window.electronAPI.bukaLinkEksternal(url);
        } else {
            window.open(url, '_blank');
        }
    }

    const IKON_TINGKAT = { error: '\u{1F6A8}', peringatan: '\u{26A0}\u{FE0F}', info: '\u{2139}\u{FE0F}' };

    /**
     * Menampilkan modal detail dari objek info SIAP-PAKAI (sudah py judul/penjelasan/dst). Dipakai
     * internal oleh {@link #tampilkanDariHasil} maupun langsung oleh pemanggil utk kasus kustom.
     *
     * <p>{@code aksi} (opsional) menambah SATU tombol aksi lanjutan di atas tombol "Mengerti" -- mis.
     * "Isi Saldo" langsung dari modal SALDO_TIDAK_CUKUP (lihat pemakaian di pos-renderer.js
     * {@code gerbangSaldoDanPin}), supaya kasir tak perlu menutup modal dulu lalu mencari menu top-up
     * sendiri (butir 6 spesifikasi "dashboard kasir": tawaran isi saldo LANGSUNG dari popup).
     * {@code onClick} dipanggil SETELAH modal ditutup.</p>
     * @param {{judul:string, penjelasan:string, langkah?:string[], pencegahan?:string[], tingkat?:string, teknis?:string, aksi?:{label:string, onClick:Function}}} info
     */
    function tampilkan(info) {
        suntikSekaliJalan();
        const tingkat = info.tingkat || 'error';

        elModal.className = 'pd-modal pd-tingkat-' + tingkat;
        elIkon.textContent = IKON_TINGKAT[tingkat] || IKON_TINGKAT.error;
        elJudul.textContent = info.judul || 'Terjadi Kesalahan';
        elPenjelasan.textContent = info.penjelasan || '';

        if (info.aksi && info.aksi.label && info.aksi.onClick) {
            elBtnAksi.textContent = info.aksi.label;
            elBtnAksi.style.display = 'block';
            elBtnAksi.onclick = () => { elOverlay.className = 'pd-overlay'; info.aksi.onClick(); };
        } else {
            elBtnAksi.style.display = 'none';
            elBtnAksi.onclick = null;
        }

        elLangkah.innerHTML = '';
        const langkah = info.langkah || [];
        elBlokLangkah.style.display = langkah.length > 0 ? 'block' : 'none';
        langkah.forEach((s) => { const li = document.createElement('li'); li.textContent = s; elLangkah.appendChild(li); });

        elPencegahan.innerHTML = '';
        const pencegahan = info.pencegahan || [];
        elBlokPencegahan.style.display = pencegahan.length > 0 ? 'block' : 'none';
        pencegahan.forEach((s) => { const li = document.createElement('li'); li.textContent = s; elPencegahan.appendChild(li); });

        elBlokTeknis.classList.remove('terbuka');
        elToggleTeknis.innerHTML = 'Tampilkan detail teknis &#9662;';
        if (info.teknis) {
            elBlokTeknis.style.display = 'block';
            elTeknis.textContent = info.teknis;
        } else {
            elBlokTeknis.style.display = 'none';
        }

        // Isi "Salin Detail"/"Laporkan ke GitHub" SELALU siap pakai, walau modal ini tak punya
        // info.teknis eksplisit (mis. kegagalan tervalidasi biasa) -- fallback ke judul+penjelasan
        // supaya kedua tombol tak pernah menyalin/melaporkan string kosong.
        judulTeknisSaatIni = info.judul || 'Error';
        teksTeknisSaatIni = info.teknis || (info.judul || '') + (info.penjelasan ? '\n\n' + info.penjelasan : '');

        elOverlay.className = 'pd-overlay tampil';
    }

    /**
     * Menerjemahkan hasil IPC {@code {ok, offline?, pesan?, kode?, butuhLoginUlang?}} (bentuk seragam
     * yang dikembalikan SELURUH method window.electronAPI.posAPI.*) menjadi info detail dari
     * {@link KAMUS}, LALU langsung menampilkannya -- SATU pemanggilan menggantikan
     * {@code tampilkanToast('error', hasil.pesan)} lama. Prioritas pencocokan: {@code butuhLoginUlang}
     * -> {@code offline} (arti beda per konteks, lihat {@code opsi.konteksOffline}) -> {@code kode}
     * terstruktur -> fallback generik yang tetap menampilkan {@code hasil.pesan} apa adanya sbg detail
     * teknis (supaya info ASLI dari server tidak pernah hilang sepenuhnya walau belum ada entri kamus
     * khusus utk itu).
     *
     * @param {{ok:boolean, offline?:boolean, pesan?:string, kode?:string, butuhLoginUlang?:boolean}} hasil
     * @param {{konteksOffline?:string}} [opsi] {@code konteksOffline}: kode KAMUS khusus dipakai saat
     *        {@code hasil.offline===true} (beda arti tiap konteks -- checkout: peringatan "tersimpan
     *        lokal" (soft); pencarian member/saldo/dll: WAJIB online, jadi tetap error biasa).
     */
    function tampilkanDariHasil(hasil, opsi) {
        opsi = opsi || {};
        if (!hasil) return;

        if (hasil.butuhLoginUlang) { tampilkan(KAMUS.SESI_KEDALUWARSA); return; }

        if (hasil.offline) {
            if (opsi.konteksOffline && KAMUS[opsi.konteksOffline]) { tampilkan(KAMUS[opsi.konteksOffline]); return; }
            tampilkan(Object.assign({}, KAMUS._DEFAULT_ERROR, {
                tingkat: 'peringatan', judul: 'Tidak Ada Koneksi',
                penjelasan: hasil.pesan || 'Perangkat ini sedang tidak terhubung ke server.'
            }));
            return;
        }

        if (hasil.pesan === 'Alamat server belum diatur.') { tampilkan(KAMUS.ALAMAT_SERVER_BELUM_DIATUR); return; }

        if (hasil.kode && KAMUS[hasil.kode]) {
            const entri = KAMUS[hasil.kode];
            tampilkan(hasil.pesan && hasil.pesan !== entri.penjelasan ? Object.assign({}, entri, { teknis: hasil.pesan }) : entri);
            return;
        }

        tampilkan(Object.assign({}, KAMUS._DEFAULT_ERROR, { teknis: hasil.pesan || null }));
    }

    window.PesanDetail = {
        tampilkan: tampilkan,
        tampilkanDariHasil: tampilkanDariHasil,
        KAMUS: KAMUS
    };
})();
