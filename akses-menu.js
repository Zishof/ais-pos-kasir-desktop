/**
 * Fitur "Hak Akses Menu per Akun" (gap-closure Toko Al-Bahjah) -- dipasang di SEMUA 13 layar utama,
 * pola sama dgn bantuan.js/i18n.js (satu skrip bersama, tiap halaman cukup menaruh tag <script>).
 * Membaca {@code window.electronAPI.posAPI.konfigurasi()} (dipanggil ULANG independen di sini,
 * SENGAJA tidak menumpang hasil panggilan renderer halaman itu sendiri -- supaya modul ini tidak
 * bergantung sama sekali pada timing/urutan skrip lain, cukup tempel & lupakan di halaman baru) lalu:
 *
 *   1. Menyembunyikan item sidebar yang menunya TIDAK diizinkan (baik {@code <a href>} MAUPUN tombol
 *      tanpa href yang mewakili halaman yang SEDANG dibuka sendiri).
 *   2. Kalau halaman yang SEDANG DIBUKA sendiri tidak diizinkan, alihkan ke menu pertama yang BOLEH
 *      diakses -- fallback tampilkan pesan "tidak ada akses" gagal-aman bila SEMUA menu ternyata
 *      terkunci (salah konfigurasi -- seharusnya jarang terjadi, tapi lebih baik drpd layar kosong).
 *
 * Peta halaman->kunci dibangun dari NAMA BERKAS (href), BUKAN teks label -- supaya tetap benar
 * walau label disunting i18n.js (data-i18n mengganti teks, tapi atribut href tak pernah disentuh).
 *
 * Gerbang SEBENARNYA tetap di server (field {@code aksesMenu} dari aksi {@code konfigurasi}, ditulis
 * HANYA lewat aksi {@code pedagang_ubah}/{@code akun_tambah} -- klien tak pernah bisa memalsukannya
 * sendiri). Modul ini MURNI pengalaman pakai (sembunyikan menu yg memang tak boleh dibuka lewat
 * sidebar), BUKAN lapisan keamanan thd pengguna teknis yg sengaja memanggil aksi API langsung --
 * lihat catatan yang sama di tiap method server terkait.
 */
(function () {
	'use strict';

	const PETA_HALAMAN = {
		'pos.html': 'kasir',
		'ringkasan.html': 'ringkasan',
		'pesanan.html': 'pesanan',
		'anggota.html': 'anggota',
		'produk.html': 'produk',
		'stokopname.html': 'stokopname',
		'kulakan.html': 'kulakan',
		'diskon.html': 'diskon',
		'retur-penjualan.html': 'returpenjualan',
		'riwayat-penjualan.html': 'riwayatpenjualan',
		'laporan-transaksi.html': 'laporantransaksi',
		'laporan.html': 'laporan',
		'riwayat-sinkronisasi.html': 'riwayatsinkronisasi',
		'log-error.html': 'logerror',
		'konfigurasi.html': 'konfigurasi',
	};

	function namaBerkasSekarang() {
		const bagian = location.pathname.split('/');
		return bagian[bagian.length - 1] || 'pos.html';
	}

	function terapkanAksesMenu(aksesMenu) {
		if (!aksesMenu) return; // konfigurasi gagal dimuat -- gagal-aman: JANGAN sembunyikan/alihkan apa pun.

		document.querySelectorAll('.nav-item').forEach((el) => {
			const berkas = (el.tagName === 'A' && el.getAttribute('href')) ? el.getAttribute('href') : namaBerkasSekarang();
			const kunci = PETA_HALAMAN[berkas];
			if (kunci && aksesMenu[kunci] === false) {
				el.style.display = 'none';
			}
		});

		const halamanIni = namaBerkasSekarang();
		const kunciSekarang = PETA_HALAMAN[halamanIni];
		if (kunciSekarang && aksesMenu[kunciSekarang] === false) {
			const tujuan = Object.keys(PETA_HALAMAN).find((berkas) => aksesMenu[PETA_HALAMAN[berkas]] !== false);
			if (tujuan && tujuan !== halamanIni) {
				location.replace(tujuan);
			} else {
				document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial,sans-serif;text-align:center;padding:24px;">'
					+ '<div><h2>Tidak Ada Akses Menu</h2><p>Akun ini tidak memiliki akses ke menu mana pun. Hubungi supervisor/admin toko untuk mengatur hak akses lewat menu Konfigurasi.</p></div></div>';
			}
		}
	}

	function daftarTokoDariKonfigurasi(konfigurasi) {
		if (!konfigurasi) return [];
		if (Array.isArray(konfigurasi.daftarToko)) return konfigurasi.daftarToko;
		if (konfigurasi.daftarToko && Array.isArray(konfigurasi.daftarToko.data)) return konfigurasi.daftarToko.data;
		return [];
	}

	function escapeHtml(teks) {
		const d = document.createElement('div');
		d.textContent = teks == null ? '' : String(teks);
		return d.innerHTML;
	}

	async function terapkanPilihToko(konfigurasi) {
		if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.pilihTokoAktif) return;
		let daftar = daftarTokoDariKonfigurasi(konfigurasi);
		let tokoAktifId = konfigurasi ? (konfigurasi.tokoAktifId || konfigurasi.tokoId) : null;
		if (daftar.length === 0 && window.electronAPI.posAPI.daftarTokoSaya) {
			try {
				const r = await window.electronAPI.posAPI.daftarTokoSaya();
				if (r && r.ok && r.data) {
					daftar = r.data.data || [];
					tokoAktifId = r.data.tokoAktifId || tokoAktifId;
				}
			} catch (e) { /* fitur tambahan -- gagal diamkan */ }
		}
		if (daftar.length <= 1) return;

		let wrap = document.getElementById('wrapPilihTokoAktifPos');
		if (!wrap) {
			wrap = document.createElement('div');
			wrap.id = 'wrapPilihTokoAktifPos';
			wrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin-top:6px;font-size:12px;color:#475569;width:100%;max-width:180px;';
			wrap.innerHTML = '<span style="font-weight:700;">Toko</span><select id="selectTokoAktifPos" title="Pilih toko aktif" style="width:100%;max-width:180px;border:1px solid #cbd5e1;border-radius:8px;padding:5px 8px;background:white;color:#0f172a;font-weight:700;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;"></select>';
			const namaToko = document.getElementById('namaToko') || document.getElementById('txtNamaToko');
			if (namaToko && namaToko.parentNode) namaToko.parentNode.insertBefore(wrap, namaToko.nextSibling);
			else document.body.insertBefore(wrap, document.body.firstChild);
		}
		const select = document.getElementById('selectTokoAktifPos');
		if (!select) return;
		select.innerHTML = daftar.map((t) => '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.nama || ('Toko #' + t.id)) + '</option>').join('');
		if (tokoAktifId != null) select.value = String(tokoAktifId);
		const terpilih = daftar.find((t) => String(t.id) === String(select.value));
		const namaToko = document.getElementById('namaToko') || document.getElementById('txtNamaToko');
		if (namaToko && terpilih) namaToko.textContent = terpilih.nama || namaToko.textContent;
		select.onchange = async () => {
			select.disabled = true;
			try {
				const r = await window.electronAPI.posAPI.pilihTokoAktif({ tokoId: Number(select.value) });
				if (!r || !r.ok) {
					alert((r && r.pesan) || 'Gagal mengganti toko aktif.');
					return;
				}
				location.reload();
			} finally {
				select.disabled = false;
			}
		};
	}

	document.addEventListener('DOMContentLoaded', () => {
		if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.konfigurasi) return;
		window.electronAPI.posAPI.konfigurasi().then((r) => {
			if (r && r.ok && r.data) {
				terapkanAksesMenu(r.data.aksesMenu);
				terapkanPilihToko(r.data);
			}
		}).catch(() => { /* gagal muat konfigurasi -- gagal-aman: jangan sembunyikan/alihkan apa pun */ });
	});
})();
