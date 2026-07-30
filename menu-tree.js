/**
 * menu-tree.js -- gap-closure dokumen "STRUKTUR_MENU_LENGKAP_EBISNIS_ID.md": pohon navigasi ERP
 * eBisnis (21 modul akar), MENGGANTIKAN sidebar `<nav>` statis flat 13-item dengan tree
 * collapsible dibangun dari data server (aksi {@code ebisnis_menu_tree}).
 *
 * Pola FILE INI SENGAJA meniru akses-menu.js/bantuan.js -- satu skrip bersama, auto-pasang lewat
 * DOMContentLoaded, tiap halaman cukup menaruh `<script src="menu-tree.js"></script>` SETELAH
 * akses-menu.js (urutan penting -- lihat catatan di bawah).
 *
 * HANYA menampilkan node yang sudah punya layar sungguhan ({@code tersedia:true} di
 * ebisnis_menu_master.json, ~26 dari 770 node taksonomi saat ini) -- beserta folder leluhurnya utk
 * konteks pengelompokan (mis. "Produk dan Harga > Master Produk" muncul sbg grup collapsible
 * meski TIDAK bisa diklik sendiri, krn cuma anaknya "Produk" yang tersedia). Sisa 744 node
 * taksonomi (peta jalan modul Finance/Inventory/HR/dll yg belum dibangun) SENGAJA tidak muncul
 * sama sekali -- bukan ditampilkan abu-abu/terkunci.
 *
 * TIDAK MENGGANTIKAN gerbang akses-menu.js -- server (KantinHelper.prosesEbisnisMenuTree) SUDAH
 * memfilter tree ini sesuai Tbmrole.ebisnisMenu (redundan dgn akses-menu.js secara sengaja, dua
 * lapis pertahanan: server tidak pernah mengirim node yang tidak boleh dilihat role ini, klien pun
 * tetap menjalankan gerbang halaman-tunggal utk halaman yang kebetulan dibuka langsung via URL).
 */
(function () {
	'use strict';

	function escHtml(s) {
		var d = document.createElement('div');
		d.textContent = s == null ? '' : String(s);
		return d.innerHTML;
	}

	/** true kalau node ini atau salah satu keturunannya menunjuk ke halaman yang sedang dibuka. */
	function mengandungHalamanIni(node, namaBerkasSekarang) {
		if (node.rute === namaBerkasSekarang) return true;
		var anak = node.children || [];
		for (var i = 0; i < anak.length; i++) {
			if (mengandungHalamanIni(anak[i], namaBerkasSekarang)) return true;
		}
		return false;
	}

	function renderLeaf(node, namaBerkasSekarang, ikon) {
		var aktif = node.rute === namaBerkasSekarang;
		var labelSpan = '<span data-i18n="' + escHtml(node.label) + '">' + escHtml(node.label) + '</span>';
		if (aktif) {
			return '<button class="nav-item aktif" type="button"><span class="ico">' + ikon + '</span> ' + labelSpan + '</button>';
		}
		return '<a class="nav-item" href="' + escHtml(node.rute) + '">' + '<span class="ico">' + ikon + '</span> ' + labelSpan + '</a>';
	}

	function ikonUntuk(kode) {
		// Ikon generik per posisi taksonomi (bukan per-node -- ratusan node taksonomi belum semua
		// punya ikon spesifik, jadi dipetakan longgar per grup akar supaya tetap konsisten visual).
		if (kode.indexOf('kasir_pos') === 0) return '&#128179;';
		if (kode.indexOf('produk_dan_harga') === 0) return '&#128230;';
		if (kode.indexOf('pelanggan_dan_crm') === 0) return '&#128100;';
		if (kode.indexOf('pembelian') === 0) return '&#128722;';
		if (kode.indexOf('gudang_dan_persediaan') === 0) return '&#128203;';
		if (kode.indexOf('produksi') === 0) return '&#127981;';
		if (kode.indexOf('penjualan') === 0) return '&#127991;&#65039;';
		if (kode.indexOf('keuangan_dan_akuntansi') === 0) return '&#128176;';
		if (kode.indexOf('laporan_dan_analitik') === 0) return '&#128202;';
		if (kode.indexOf('administrasi_sistem') === 0) return '&#9881;&#65039;';
		return '&#128193;';
	}

	function renderNode(node, namaBerkasSekarang) {
		var anak = node.children || [];
		var ikon = ikonUntuk(node.kode);
		if (anak.length === 0) {
			return node.tersedia && node.rute ? renderLeaf(node, namaBerkasSekarang, ikon) : '';
		}
		var terbuka = mengandungHalamanIni(node, namaBerkasSekarang);
		var html = '<details class="nav-group"' + (terbuka ? ' open' : '') + '>';
		html += '<summary class="nav-group-label"><span class="ico">' + ikon + '</span> <span data-i18n="' + escHtml(node.label) + '">' + escHtml(node.label) + '</span></summary>';
		html += '<div class="nav-group-children">';
		if (node.tersedia && node.rute) {
			html += renderLeaf(node, namaBerkasSekarang, ikon);
		}
		for (var i = 0; i < anak.length; i++) {
			html += renderNode(anak[i], namaBerkasSekarang);
		}
		html += '</div></details>';
		return html;
	}

	var CSS_TREE = '\n.nav-group { margin: 0; }\n' +
		'.nav-group > summary.nav-group-label { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 9px; font-size: 13.5px; font-weight: 600; color: var(--muted, #64748b); }\n' +
		'.nav-group > summary.nav-group-label::-webkit-details-marker { display: none; }\n' +
		'.nav-group > summary.nav-group-label:hover { background: var(--primary-50, #eff6ff); }\n' +
		'.nav-group > summary.nav-group-label .ico { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }\n' +
		'.nav-group[open] > summary.nav-group-label { color: var(--primary, #2563eb); }\n' +
		'.nav-group-children { padding-left: 16px; display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }\n' +
		'.nav-group-children .nav-item { font-size: 12.5px; }\n';

	function suntikCss() {
		var style = document.createElement('style');
		style.setAttribute('data-menu-tree', '1');
		style.textContent = CSS_TREE;
		document.head.appendChild(style);
	}

	function namaBerkasSekarang() {
		var jalan = location.pathname.replace(/\\/g, '/');
		var bagian = jalan.split('/');
		return bagian[bagian.length - 1] || 'pos.html';
	}

	async function muatDanRenderTree() {
		var elNav = document.querySelector('.sidebar nav');
		if (!elNav || !window.electronAPI || !window.electronAPI.posAPI || !window.electronAPI.posAPI.ebisnisMenuTree) return;
		try {
			var r = await window.electronAPI.posAPI.ebisnisMenuTree({ platform: 'desktop' });
			if (!r || !r.ok || !r.data || !r.data.tree) return; // gagal diam -- nav statis lama (belum diganti akses-menu.js) tetap tampil sbg fallback
			var tree = r.data.tree;
			if (!tree.length) return; // kosong (server error/role tanpa akses apa pun) -- jangan hapus nav yg sudah ada
			var namaSekarang = namaBerkasSekarang();
			var html = '';
			for (var i = 0; i < tree.length; i++) {
				html += renderNode(tree[i], namaSekarang);
			}
			if (html.trim()) {
				suntikCss();
				elNav.innerHTML = html;
				if (window.Kamus && typeof window.Kamus.terapkanKeElemen === 'function') {
					window.Kamus.terapkanKeElemen(elNav);
				}
			}
		} catch (e) { /* biarkan nav statis lama tampil -- ini murni peningkatan progresif */ }
	}

	document.addEventListener('DOMContentLoaded', muatDanRenderTree);
})();
