/**
 * diskon-renderer.js -- Layar "Aturan Diskon" (fitur baru: "tambahkan fitur mengatur diskon seperti
 * fitur POS online"). Mengelola baris {@code koperasi.aturan_diskon} lewat window.electronAPI.posAPI.diskon.*
 * (IPC ke proses utama) -- lihat JavaDoc server {@code KantinHelper.diskonList}/{@code diskonSimpan}.
 *
 * PENTING (batas cakupan, lihat JavaDoc server): layar ini HANYA mengelola aturannya (CRUD). Mesin
 * penerapan diskon otomatis saat checkout ({@code PosKantinAction.evaluasiDiskon}, dipakai Kasir
 * web/ZK) TIDAK diporting ke checkout Kasir Desktop di sini -- aturan yang dibuat lewat layar ini
 * akan otomatis aktif di Kasir web/ZK, TAPI belum di Kasir Desktop.
 */
(function () {
    const elNamaToko = document.getElementById('namaToko');
    const elStatusPill = document.getElementById('statusPill');
    const elStatusTeks = document.getElementById('statusTeks');
    const elLayarMuat = document.getElementById('layarMuat');
    const elToast = document.getElementById('toast');

    const elCariDiskon = document.getElementById('cariDiskon');
    const elBtnTambahDiskon = document.getElementById('btnTambahDiskon');
    const elTabelDiskon = document.getElementById('tabelDiskon');
    const elInfoPaginasiDiskon = document.getElementById('infoPaginasiDiskon');
    const elBtnHalSebelumnyaDiskon = document.getElementById('btnHalSebelumnyaDiskon');
    const elBtnHalBerikutnyaDiskon = document.getElementById('btnHalBerikutnyaDiskon');

    const elOverlayFormDiskon = document.getElementById('overlayFormDiskon');
    const elJudulFormDiskon = document.getElementById('judulFormDiskon');
    const elBtnTutupFormDiskon = document.getElementById('btnTutupFormDiskon');
    const elFormDiskonNama = document.getElementById('formDiskonNama');
    const elFormDiskonKeterangan = document.getElementById('formDiskonKeterangan');
    const elFormDiskonSemuaProduk = document.getElementById('formDiskonSemuaProduk');
    const elWrapKodeProduk = document.getElementById('wrapKodeProduk');
    const elFormDiskonKodeProduk = document.getElementById('formDiskonKodeProduk');
    const elWrapToko = document.getElementById('wrapToko');
    const elFormDiskonSemuaToko = document.getElementById('formDiskonSemuaToko');
    const elWrapTokoId = document.getElementById('wrapTokoId');
    const elFormDiskonTokoId = document.getElementById('formDiskonTokoId');
    const elFormDiskonSemuaMember = document.getElementById('formDiskonSemuaMember');
    const elWrapTargetMember = document.getElementById('wrapTargetMember');
    const elFormDiskonJenisAnggota = document.getElementById('formDiskonJenisAnggota');
    const elFormDiskonTipeAnggota = document.getElementById('formDiskonTipeAnggota');
    const elFormDiskonTanggalMulai = document.getElementById('formDiskonTanggalMulai');
    const elFormDiskonTanggalSelesai = document.getElementById('formDiskonTanggalSelesai');
    const elFormDiskonPersentase = document.getElementById('formDiskonPersentase');
    const elFormDiskonMaksimalPotongan = document.getElementById('formDiskonMaksimalPotongan');
    const elFormDiskonNominal = document.getElementById('formDiskonNominal');
    const elFormDiskonPotongLangsung = document.getElementById('formDiskonPotongLangsung');
    const elFormDiskonSimpanSaldo = document.getElementById('formDiskonSimpanSaldo');
    const elFormDiskonPerHariPerToko = document.getElementById('formDiskonPerHariPerToko');
    const elFormDiskonAktif = document.getElementById('formDiskonAktif');
    const elBtnSimpanDiskon = document.getElementById('btnSimpanDiskon');

    function formatRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function escapeHtmlLokal(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    let toastTimer = null;
    function tampilkanToast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.className = 'toast ' + jenis; }, 3200);
    }

    let isAdminAkun = false;
    /** Gerbang supervisor (SAMA pola dgn produk-renderer.js) -- kasir biasa hanya boleh melihat aturan diskon, tidak menambah/mengubah. Gerbang SEBENARNYA ditegakkan server-side (KantinHelper.diskonSimpan). */
    let supervisorPedagang = false;
    let aksesMenuCrud = {};
    const bolehAksiMenu = (kunci, aksi) => {
        if (isAdminAkun || supervisorPedagang) return true;
        const crud = aksesMenuCrud && aksesMenuCrud[kunci];
        if (!crud) return false;
        if (crud.supervisor === true) return true;
        return crud[aksi] !== false;
    };
    const bolehKelolaDiskon = () => bolehAksiMenu('diskon', 'update') || bolehAksiMenu('diskon', 'create');

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
                elWrapToko.style.display = isAdminAkun ? 'flex' : 'none';
                elBtnTambahDiskon.style.display = bolehKelolaDiskon() ? '' : 'none';
                renderTabelDiskon(daftarDiskonTerakhir);
            }
        } catch (e) { /* abaikan */ }
    }

    // ==== Dropdown Jenis/Tipe Anggota ====
    async function muatJenisTipeAnggota() {
        try {
            const r = await window.electronAPI.posAPI.anggota.jenisList();
            const daftar = (r.ok && r.data && r.data.data) || [];
            elFormDiskonJenisAnggota.innerHTML = '<option value="">-- Tidak ditentukan --</option>';
            daftar.forEach((j) => { const opt = document.createElement('option'); opt.value = j.id; opt.textContent = j.nama; elFormDiskonJenisAnggota.appendChild(opt); });
        } catch (e) { /* abaikan */ }
        try {
            const r = await window.electronAPI.posAPI.anggota.tipeList();
            const daftar = (r.ok && r.data && r.data.data) || [];
            elFormDiskonTipeAnggota.innerHTML = '<option value="">-- Tidak ditentukan --</option>';
            daftar.forEach((t) => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.nama; elFormDiskonTipeAnggota.appendChild(opt); });
        } catch (e) { /* abaikan */ }
    }

    // ==== Daftar/pencarian aturan diskon ====

    const state = { keyword: '', page: 1, pageSize: 20, total: 0 };
    let cariTimer = null;
    let daftarDiskonTerakhir = [];

    function renderTabelDiskon(daftar) {
        daftarDiskonTerakhir = daftar || [];
        if (!daftar || daftar.length === 0) {
            elTabelDiskon.innerHTML = '<tr><td><div class="daftar-kosong"><span class="ico">&#127991;&#65039;</span>Belum ada aturan diskon.</div></td></tr>';
            return;
        }
        const kelola = bolehKelolaDiskon();
        let html = '<thead><tr><th>Nama Aturan</th><th>Produk</th><th>Toko</th><th>Nilai</th><th>Eksekusi</th><th>Status</th>' + (kelola ? '<th></th>' : '') + '</tr></thead><tbody>';
        daftar.forEach((d) => {
            const nilai = d.persentase > 0 ? (d.persentase + '%' + (d.maksimalPotongan > 0 ? ' (maks ' + formatRupiah(d.maksimalPotongan) + ')' : '')) : formatRupiah(d.nominal);
            html += '<tr>'
                + '<td style="font-weight:700;' + (kelola ? 'cursor:pointer;" class="nama-diskon"' : '"') + ' data-id="' + d.id + '">' + escapeHtmlLokal(d.namaAturan) + '</td>'
                + '<td>' + (d.produkNama ? escapeHtmlLokal(d.produkNama) : '<span class="badge biru">Semua Produk</span>') + '</td>'
                + '<td>' + (d.tokoNama ? escapeHtmlLokal(d.tokoNama) : '<span class="badge biru">Semua Toko</span>') + '</td>'
                + '<td>' + nilai + '</td>'
                + '<td>' + (d.potonganLangsung ? 'Potong Langsung' : 'Saldo/Cashback') + '</td>'
                + '<td>' + (d.aktif ? '<span class="badge hijau">Aktif</span>' : '<span class="badge abu">Non-Aktif</span>') + '</td>'
                + (kelola ? '<td><button type="button" class="btn-kecil ubah-diskon" data-id="' + d.id + '">Ubah</button></td>' : '')
                + '</tr>';
        });
        html += '</tbody>';
        elTabelDiskon.innerHTML = html;
        if (kelola) {
            elTabelDiskon.querySelectorAll('.ubah-diskon, .nama-diskon').forEach((el) => {
                el.addEventListener('click', () => bukaFormUbah(daftar.find((d) => String(d.id) === el.getAttribute('data-id'))));
            });
        }
    }

    function renderPaginasiDiskon() {
        const totalHal = Math.max(1, Math.ceil(state.total / state.pageSize));
        elInfoPaginasiDiskon.textContent = 'Halaman ' + state.page + ' dari ' + totalHal + ' (' + state.total + ' aturan)';
        elBtnHalSebelumnyaDiskon.disabled = state.page <= 1;
        elBtnHalBerikutnyaDiskon.disabled = state.page >= totalHal;
    }

    async function muatDaftarDiskon() {
        elLayarMuat.className = 'layar-penuh';
        try {
            const r = await window.electronAPI.posAPI.diskon.list({ keyword: state.keyword, page: state.page, page_size: state.pageSize });
            if (!r.ok) {
                window.PesanDetail.tampilkanDariHasil(r);
                renderTabelDiskon([]);
                return;
            }
            state.total = r.data.total || 0;
            renderTabelDiskon(r.data.data || []);
            renderPaginasiDiskon();
        } catch (e) {
            tampilkanToast('error', 'Gagal memuat aturan diskon: ' + (e && e.message ? e.message : e));
        } finally {
            elLayarMuat.className = 'layar-penuh tersembunyi';
        }
    }

    elCariDiskon.addEventListener('input', () => {
        clearTimeout(cariTimer);
        cariTimer = setTimeout(() => { state.keyword = elCariDiskon.value.trim(); state.page = 1; muatDaftarDiskon(); }, 350);
    });
    elBtnHalSebelumnyaDiskon.addEventListener('click', () => { if (state.page > 1) { state.page--; muatDaftarDiskon(); } });
    elBtnHalBerikutnyaDiskon.addEventListener('click', () => { state.page++; muatDaftarDiskon(); });

    // ==== Toggle tampil/sembunyi field tergantung checkbox ====
    elFormDiskonSemuaProduk.addEventListener('change', () => { elWrapKodeProduk.style.display = elFormDiskonSemuaProduk.checked ? 'none' : 'block'; });
    elFormDiskonSemuaToko.addEventListener('change', () => { elWrapTokoId.style.display = elFormDiskonSemuaToko.checked ? 'none' : 'block'; });
    elFormDiskonSemuaMember.addEventListener('change', () => { elWrapTargetMember.style.display = elFormDiskonSemuaMember.checked ? 'none' : 'flex'; });

    // ==== Form tambah/ubah ====

    let idSedangDiubah = null;

    function resetForm() {
        elFormDiskonNama.value = '';
        elFormDiskonKeterangan.value = '';
        elFormDiskonSemuaProduk.checked = true;
        elWrapKodeProduk.style.display = 'none';
        elFormDiskonKodeProduk.value = '';
        elFormDiskonSemuaToko.checked = true;
        elWrapTokoId.style.display = 'none';
        elFormDiskonTokoId.value = '';
        elFormDiskonSemuaMember.checked = true;
        elWrapTargetMember.style.display = 'none';
        elFormDiskonJenisAnggota.value = '';
        elFormDiskonTipeAnggota.value = '';
        elFormDiskonTanggalMulai.value = '';
        elFormDiskonTanggalSelesai.value = '';
        elFormDiskonPersentase.value = 0;
        elFormDiskonMaksimalPotongan.value = 0;
        elFormDiskonNominal.value = 0;
        elFormDiskonPotongLangsung.checked = true;
        elFormDiskonPerHariPerToko.checked = false;
        elFormDiskonAktif.checked = true;
    }

    function bukaFormTambah() {
        idSedangDiubah = null;
        elJudulFormDiskon.textContent = 'Tambah Aturan Diskon';
        resetForm();
        elOverlayFormDiskon.className = 'overlay tampil';
        elFormDiskonNama.focus();
    }

    function bukaFormUbah(d) {
        if (!d) return;
        idSedangDiubah = d.id;
        elJudulFormDiskon.textContent = 'Ubah Aturan: ' + d.namaAturan;
        resetForm();
        elFormDiskonNama.value = d.namaAturan || '';
        elFormDiskonSemuaProduk.checked = !d.produkNama;
        elWrapKodeProduk.style.display = d.produkNama ? 'block' : 'none';
        // Catatan: kode produk tak dikirim daftar (hanya nama) -- kasir perlu mengetik ulang kode bila ganti target produk.
        elFormDiskonSemuaToko.checked = !d.tokoNama;
        elWrapTokoId.style.display = 'none'; // id toko tak dikirim daftar; admin isi ulang bila ingin ganti toko spesifik
        elFormDiskonPersentase.value = d.persentase || 0;
        elFormDiskonNominal.value = d.nominal || 0;
        elFormDiskonPotongLangsung.checked = !!d.potonganLangsung;
        elFormDiskonSimpanSaldo.checked = !d.potonganLangsung;
        elFormDiskonAktif.checked = d.aktif !== false;
        elOverlayFormDiskon.className = 'overlay tampil';
        elFormDiskonNama.focus();
    }

    elBtnTambahDiskon.addEventListener('click', () => { if (bolehKelolaDiskon()) bukaFormTambah(); });
    elBtnTutupFormDiskon.addEventListener('click', () => { elOverlayFormDiskon.className = 'overlay'; });

    elBtnSimpanDiskon.addEventListener('click', async () => {
        if (!bolehKelolaDiskon()) return;
        const nama = elFormDiskonNama.value.trim();
        if (!nama) { tampilkanToast('error', 'Nama aturan wajib diisi.'); elFormDiskonNama.focus(); return; }
        if (!elFormDiskonSemuaProduk.checked && !elFormDiskonKodeProduk.value.trim()) {
            tampilkanToast('error', 'Isi kode produk, atau centang "Berlaku Untuk Semua Produk".');
            elFormDiskonKodeProduk.focus();
            return;
        }

        const payload = {
            nama_aturan: nama,
            keterangan: elFormDiskonKeterangan.value.trim(),
            berlaku_semua_produk: elFormDiskonSemuaProduk.checked,
            kode_produk: elFormDiskonKodeProduk.value.trim(),
            berlaku_semua_member: elFormDiskonSemuaMember.checked,
            jenis_anggota_id: elFormDiskonJenisAnggota.value || null,
            tipe_anggota_id: elFormDiskonTipeAnggota.value || null,
            tanggal_mulai: elFormDiskonTanggalMulai.value || null,
            tanggal_selesai: elFormDiskonTanggalSelesai.value || null,
            persentase: parseFloat(elFormDiskonPersentase.value) || 0,
            maksimal_potongan: parseFloat(elFormDiskonMaksimalPotongan.value) || 0,
            nominal: parseFloat(elFormDiskonNominal.value) || 0,
            potongan_langsung: elFormDiskonPotongLangsung.checked,
            berlaku_per_hari_dan_per_toko: elFormDiskonPerHariPerToko.checked,
            aktif: elFormDiskonAktif.checked
        };
        if (isAdminAkun && !elFormDiskonSemuaToko.checked) payload.toko_id = elFormDiskonTokoId.value || null;
        if (idSedangDiubah) payload.id = idSedangDiubah;

        elBtnSimpanDiskon.disabled = true;
        elBtnSimpanDiskon.textContent = 'Menyimpan...';
        try {
            const r = await window.electronAPI.posAPI.diskon.simpan(payload);
            if (r.ok) {
                tampilkanToast('success', (idSedangDiubah ? 'Aturan diskon diperbarui.' : 'Aturan diskon baru ditambahkan.'));
                elOverlayFormDiskon.className = 'overlay';
                muatDaftarDiskon();
            } else {
                window.PesanDetail.tampilkanDariHasil(r);
            }
        } finally {
            elBtnSimpanDiskon.disabled = false;
            elBtnSimpanDiskon.textContent = 'Simpan';
        }
    });

    // ==== Inisialisasi ====
    segarkanStatus();
    muatJenisTipeAnggota();
    muatDaftarDiskon();
    setInterval(segarkanStatus, 30000);
    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcher'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }
})();
