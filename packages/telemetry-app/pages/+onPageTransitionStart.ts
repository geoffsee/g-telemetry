import type { PageContextClient } from "vike/types";

export async function onPageTransitionStart(
	_pageContext: Partial<PageContextClient>,
) {
	document.body.classList.add("page-transition");
}
