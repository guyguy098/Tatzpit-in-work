// ── CENTCOM Dashboard ─────────────────────────────────────────────────────
function openCentcom() {
	document.getElementById('centcomOverlay').classList.add('active');
	document.body.style.overflow = 'hidden';
	document.documentElement.style.overflow = 'hidden';
	const frame = document.getElementById('centcomFrame');
	if (!frame.src || frame.src === window.location.href || frame.src === 'about:blank') {
		frame.src = 'centcom.html';
	}
}

function closeCentcom() {
	document.getElementById('centcomOverlay').classList.remove('active');
	if (!document.querySelector('.ai-sum-overlay.active')) {
		document.body.style.overflow = '';
		document.documentElement.style.overflow = '';
	}
}