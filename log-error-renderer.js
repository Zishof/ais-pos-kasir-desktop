/**
 * log-error-renderer.js -- Logika layar "Log Error" (menu baru di sidebar Desktop, lihat JavaDoc
 * tabel {@code error_log} di local-db.js). Menampilkan SELURUH error/exception yang tertangkap di
 * aplikasi ini -- baik dari proses utama ({@code main:*}, mis. kegagalan panggilan {@code /PosApi}
 * atau crash tak tertangkap) maupun dari jendela renderer manapun ({@code renderer:*}, ditangkap
 * {@code error-capture.js} yang dimuat di SETIAP halaman) -- dengan filter, paginasi, dan aksi
 * hapus/bersihkan/salin per baris. TIDAK ADA fetch()/XHR di sini -- seluruh data lewat
 * {@code window.electronAPI.posAPI.errorLog} (IPC ke proses utama, lihat JavaDoc handler
 * {@code pos:error-log-*} di main.js).
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elBtnMuatUlang = document.getElementById('btnMuatUlang');
    const elBtnSalinSemua = document.getElementById('btnSalinSemua');
    const elBtnBersihkanSemua = document.getElementById('btnBersihkanSemua');
    const elRingkasBar = document.getElementById('ringkasBar');
    const elFilterTingkat = document.getElementById('filterTingkat');
    const elFilterSumber = document.getElementById('filterSumber');
    const elFilterDari = document.getElementById('filterDari');
    const elFilterSampai = document.getElementById('filterSampai');
    const elFilterKeyword = document.getElementById('filterKeyword');
    const elWadahLog = document.getElementById('wadahLog');
    const elBtnMuatLagi = document.getElementById('btnMuatLagi');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    const BATAS_PER_HALAMAN = 100;
    let offset = 0;
    let total = 0;
    let daftar = [];

    function formatWaktu(iso) {
        if (!iso) return '-';
        try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }); }
        catch (e) { return iso; }
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    /**
     * Salin teks ke clipboard dgn fallback -- {@code navigator.clipboard.writeText} MELEMPAR
     * "Document is not focused" bila jendela Electron ini kebetulan tidak sedang fokus OS saat tombol
     * diklik (mis. baru saja beralih dari jendela lain) -- Clipboard API modern SENGAJA menolak
     * bekerja tanpa fokus dokumen sbg proteksi keamanan browser, bukan bug transient yg akan hilang
     * sendiri. Fallback {@code document.execCommand('copy')} via textarea sementara TIDAK punya
     * batasan fokus yg sama, pola SAMA persis dgn {@code error-alert.js#salinFallback} (Android) supaya
     * "Salin" tetap berhasil walau jendela sedang tak fokus.
     * @param {string} teks
     * @param {string} [pesanSukses]
     */
    function salinKeClipboard(teks, pesanSukses) {
        const sukses = pesanSukses || 'Disalin ke clipboard.';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(teks).then(
                () => tampilkanToast('success', sukses),
                () => salinFallback(teks, sukses)
            );
        } else {
            salinFallback(teks, sukses);
        }
    }
    function salinFallback(teks, pesanSukses) {
        try {
            const ta = document.createElement('textarea');
            ta.value = teks;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            tampilkanToast('success', pesanSukses || 'Disalin ke clipboard.');
        } catch (e) {
            tampilkanToast('error', 'Gagal menyalin -- coba klik dulu di dalam jendela ini lalu ulangi.');
        }
    }

    async function segarkanStatus() {
        try {
            const status = await window.electronAPI.posAPI.status();
            const tersedia = !!(status && status.tersedia);
            elStatusPill.className = 'status-pill ' + (tersedia ? 'online' : 'offline');
            elStatusTeks.textContent = tersedia ? 'Sesi Aktif' : 'Tidak Ada Sesi';
        } catch (e) { /* abaikan -- bukan jalur kritis */ }
        try {
            const hasilKonfig = await window.electronAPI.posAPI.konfigurasi();
            if (hasilKonfig && hasilKonfig.ok && hasilKonfig.data) {
                elNamaToko.textContent = hasilKonfig.data.tokoNama || 'Kasir';
            }
        } catch (e) { /* abaikan */ }
    }

    /** @return {object} filter dasar dari kontrol UI, TANPA {@code tingkat} -- dipakai ulang utk kartu ringkasan (per-tingkat) dan daftar utama. */
    function bacaFilterDasar() {
        const f = {};
        if (elFilterSumber.value) f.sumber = elFilterSumber.value;
        if (elFilterDari.value) f.dariTanggal = elFilterDari.value + 'T00:00:00';
        if (elFilterSampai.value) f.sampaiTanggal = elFilterSampai.value + 'T23:59:59';
        if (elFilterKeyword.value.trim()) f.keyword = elFilterKeyword.value.trim();
        return f;
    }

    async function segarkanRingkasan() {
        const dasar = bacaFilterDasar();
        try {
            const [semua, errorSaja, peringatanSaja] = await Promise.all([
                window.electronAPI.posAPI.errorLog.list(Object.assign({}, dasar, { limit: 1 })),
                window.electronAPI.posAPI.errorLog.list(Object.assign({}, dasar, { tingkat: 'error', limit: 1 })),
                window.electronAPI.posAPI.errorLog.list(Object.assign({}, dasar, { tingkat: 'peringatan', limit: 1 }))
            ]);
            elRingkasBar.innerHTML =
                '<div class="kartu-ringkas"><div class="label">Total Sesuai Filter</div><div class="nilai">' + ((semua && semua.total) || 0) + '</div></div>' +
                '<div class="kartu-ringkas error"><div class="label">Error</div><div class="nilai">' + ((errorSaja && errorSaja.total) || 0) + '</div></div>' +
                '<div class="kartu-ringkas peringatan"><div class="label">Peringatan</div><div class="nilai">' + ((peringatanSaja && peringatanSaja.total) || 0) + '</div></div>';
        } catch (e) { elRingkasBar.innerHTML = ''; }
    }

    function bangunFilterLengkap() {
        const f = bacaFilterDasar();
        if (elFilterTingkat.value) f.tingkat = elFilterTingkat.value;
        f.limit = BATAS_PER_HALAMAN;
        f.offset = offset;
        return f;
    }

    async function muatLog(reset) {
        if (reset) { offset = 0; daftar = []; }
        try {
            const hasil = await window.electronAPI.posAPI.errorLog.list(bangunFilterLengkap());
            if (!hasil || !hasil.ok) {
                tampilkanToast('error', (hasil && hasil.pesan) || 'Gagal memuat log error.');
                return;
            }
            daftar = daftar.concat(hasil.data || []);
            total = hasil.total || 0;
            renderTabel();
            elBtnMuatLagi.style.display = daftar.length < total ? 'block' : 'none';
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat log error: ' + (e && e.message ? e.message : e));
        }
    }

    function escapeHtml(teks) {
        const d = document.createElement('div');
        d.textContent = String(teks == null ? '' : teks);
        return d.innerHTML;
    }

    function renderTabel() {
        if (daftar.length === 0) {
            elWadahLog.innerHTML = '<div class="daftar-kosong"><span class="ico">&#9989;</span>' +
                (total === 0 && !elFilterTingkat.value && !elFilterSumber.value && !elFilterKeyword.value
                    ? 'Belum ada error/exception tercatat -- bagus!'
                    : 'Tidak ada baris yang cocok dengan filter saat ini.') + '</div>';
            return;
        }
        let html = '<table class="tabel-log"><thead><tr>' +
            '<th style="width:130px;">Waktu</th><th style="width:70px;">Tingkat</th><th style="width:160px;">Sumber</th>' +
            '<th>Pesan</th><th style="width:110px;">Layar</th><th style="width:90px;"></th>' +
            '</tr></thead><tbody>';
        daftar.forEach((r) => {
            const idBaris = 'detailLog' + r.id;
            html += '<tr>' +
                '<td class="waktu">' + escapeHtml(formatWaktu(r.waktu)) + '</td>' +
                '<td><span class="badge-tingkat ' + (r.tingkat === 'peringatan' ? 'peringatan' : 'error') + '">' + escapeHtml(r.tingkat || 'error') + '</span></td>' +
                '<td class="sumber">' + escapeHtml(r.sumber) + '</td>' +
                '<td class="pesan">' + escapeHtml(r.pesan) +
                (r.detail ? ' <span class="link-toggle" data-toggle="' + idBaris + '">Detail &#9662;</span><div class="detail-baris" id="' + idBaris + '">' + escapeHtml(r.detail) + '</div>' : '') +
                '</td>' +
                '<td>' + escapeHtml(r.layar || '-') + '</td>' +
                '<td class="aksi-baris">' +
                (r.detail ? '<button type="button" class="salin" data-id="' + r.id + '">Salin</button>' : '') +
                '<button type="button" class="hapus" data-id="' + r.id + '">Hapus</button>' +
                '</td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        elWadahLog.innerHTML = html;
    }

    elWadahLog.addEventListener('click', (ev) => {
        const toggle = ev.target.closest('[data-toggle]');
        if (toggle) {
            const el = document.getElementById(toggle.getAttribute('data-toggle'));
            if (el) el.classList.toggle('tampil');
            return;
        }
        const btnSalin = ev.target.closest('button.salin');
        if (btnSalin) {
            const r = daftar.find((x) => String(x.id) === btnSalin.getAttribute('data-id'));
            if (r) {
                const teks = '[' + formatWaktu(r.waktu) + '] ' + r.sumber + ' (' + r.tingkat + ')\n' + r.pesan + (r.detail ? ('\n\n' + r.detail) : '');
                salinKeClipboard(teks, 'Detail error disalin -- siap ditempel ke chat/tiket.');
            }
            return;
        }
        const btnHapus = ev.target.closest('button.hapus');
        if (btnHapus) {
            const id = Number(btnHapus.getAttribute('data-id'));
            if (!confirm('Hapus baris log error ini?')) return;
            window.electronAPI.posAPI.errorLog.hapus({ id: id }).then((hasil) => {
                if (hasil && hasil.ok) {
                    daftar = daftar.filter((x) => x.id !== id);
                    total = Math.max(0, total - 1);
                    renderTabel();
                    segarkanRingkasan();
                    tampilkanToast('success', 'Baris log dihapus.');
                } else {
                    tampilkanToast('error', (hasil && hasil.pesan) || 'Gagal menghapus baris log.');
                }
            });
        }
    });

    /**
     * Mengambil SELURUH baris yang cocok dengan filter aktif saat ini (bukan cuma yang sudah dimuat
     * ke layar lewat paginasi "Muat 100 Lagi") -- dipanggil paginasi berulang ke {@code errorLog.list}
     * (batas server 500/panggilan, lihat {@code local-db.js#listErrorLog}) sampai seluruh baris yang
     * cocok terkumpul, dibatasi {@code BATAS_AMAN} sebagai jaring pengaman terhadap filter yang tak
     * sengaja cocok dgn puluhan ribu baris (tabel {@code error_log} sendiri dijaga maks 5000 baris).
     */
    async function ambilSemuaSesuaiFilter() {
        const filterDasar = bacaFilterDasar();
        if (elFilterTingkat.value) filterDasar.tingkat = elFilterTingkat.value;
        const BATAS_PANGGILAN = 500;
        const BATAS_AMAN = 5000;
        const semua = [];
        let offset = 0;
        for (;;) {
            const hasil = await window.electronAPI.posAPI.errorLog.list(Object.assign({}, filterDasar, { limit: BATAS_PANGGILAN, offset: offset }));
            if (!hasil || !hasil.ok) return { ok: false, pesan: hasil && hasil.pesan };
            const baris = hasil.data || [];
            semua.push(...baris);
            offset += BATAS_PANGGILAN;
            if (baris.length < BATAS_PANGGILAN || semua.length >= (hasil.total || 0) || semua.length >= BATAS_AMAN) break;
        }
        return { ok: true, data: semua };
    }

    elBtnSalinSemua.addEventListener('click', async () => {
        elBtnSalinSemua.disabled = true;
        try {
            const hasil = await ambilSemuaSesuaiFilter();
            if (!hasil.ok) { tampilkanToast('error', hasil.pesan || 'Gagal mengambil daftar error.'); return; }
            if (hasil.data.length === 0) { tampilkanToast('info', 'Tidak ada error untuk disalin (sesuai filter saat ini).'); return; }
            const teks = hasil.data.map((r) =>
                '[' + formatWaktu(r.waktu) + '] ' + r.sumber + ' (' + r.tingkat + ')\n' + r.pesan + (r.detail ? ('\n' + r.detail) : '')
            ).join('\n\n---\n\n');
            salinKeClipboard(teks, hasil.data.length + ' error disalin ke clipboard.');
        } catch (e) {
            tampilkanToast('error', 'Gagal menyalin: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSalinSemua.disabled = false;
        }
    });

    elBtnBersihkanSemua.addEventListener('click', async () => {
        if (!confirm('Hapus SELURUH log error tersimpan di perangkat ini? Tindakan ini tidak bisa dibatalkan.')) return;
        const hasil = await window.electronAPI.posAPI.errorLog.bersihkan();
        if (hasil && hasil.ok) {
            tampilkanToast('success', 'Seluruh log error sudah dibersihkan.');
            muatLog(true);
            segarkanRingkasan();
        } else {
            tampilkanToast('error', (hasil && hasil.pesan) || 'Gagal membersihkan log error.');
        }
    });

    elBtnMuatUlang.addEventListener('click', () => { muatLog(true); segarkanRingkasan(); });
    elBtnMuatLagi.addEventListener('click', () => { offset += BATAS_PER_HALAMAN; muatLog(false); });

    let filterDebounce = null;
    [elFilterTingkat, elFilterSumber, elFilterDari, elFilterSampai].forEach((el) => {
        el.addEventListener('change', () => { muatLog(true); segarkanRingkasan(); });
    });
    elFilterKeyword.addEventListener('input', () => {
        if (filterDebounce) clearTimeout(filterDebounce);
        filterDebounce = setTimeout(() => { muatLog(true); segarkanRingkasan(); }, 350);
    });

    (async function mulai() {
        segarkanStatus();
        await Promise.all([muatLog(true), segarkanRingkasan()]);
        elLayarMuat.className = 'layar-penuh tersembunyi';
    })();
})();
