// ── Hormuz Crisis Tracker ─────────────────────────────────────────────────
function openHormuz() {
	document.getElementById('hormuzOverlay').classList.add('active');
	document.body.style.overflow = 'hidden';
	document.documentElement.style.overflow = 'hidden';
	// Lazy-load the iframe so it doesn't load on page start
	const frame = document.getElementById('hormuzFrame');
	if (!frame.src || frame.src === window.location.href || frame.src === 'about:blank') {
		frame.src = 'hormuz.html';
	}
}

function closeHormuz() {
	document.getElementById('hormuzOverlay').classList.remove('active');
	if (!document.querySelector('.ai-sum-overlay.active')) {
		document.body.style.overflow = '';
		document.documentElement.style.overflow = '';
	}
}