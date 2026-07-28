/**
 * Fitur "Tombol Logout" di sidebar (SEMUA 13 layar) -- gap-closure keluhan Toko Al-Bahjah: kasir
 * non-teknis jarang menyadari menu native "Keluar Akun (Logout)..." di menu bar aplikasi.
 *
 * Pola FILE INI SENGAJA meniru bantuan.js/akses-menu.js (satu skrip bersama, auto-pasang lewat
 * DOMContentLoaded ke {@code #btnLogoutAkun}, tiap halaman cukup menaruh tombol + tag <script>).
 *
 * Tombol ini MURNI pemicu -- SELURUH logika (konfirmasi native, hapus kredensial "Ingat Saya" &
 * hash offline supaya TIDAK auto-login lagi lain kali, cabut token server, kembali ke layar login)
 * SATU-SATUNYA ditulis di {@code main.js} ({@code logoutDariAplikasi}), sama fungsi yg dipakai menu
 * native "Keluar Akun (Logout)..." -- supaya tak pernah ada 2 implementasi logout yg diam-diam bisa
 * berbeda perilaku.
 */
(function () {
	'use strict';
	document.addEventListener('DOMContentLoaded', () => {
		const tombol = document.getElementById('btnLogoutAkun');
		if (!tombol) return;
		tombol.addEventListener('click', () => {
			if (!window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.keluarAkun) return;
			// Dialog konfirmasi native (main.js) sudah menangani "Batal" -- tak perlu confirm() lagi di sini.
			window.electronAPI.posAPI.keluarAkun().catch(() => { /* jendela kemungkinan sudah ditutup begitu logout diproses -- abaikan */ });
		});
	});
})();
