export function sidebarSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-sidebar`);
  $svg.setAttribute("viewBox", "0 0 64 64");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute("d", "M50 8H14c-3.309 0-6 2.691-6 6v36c0 3.309 2.691 6 6 6h36c3.309 0 6-2.691 6-6V14c0-3.309-2.691-6-6-6zM12 50V14c0-1.103.897-2 2-2h8v40h-8c-1.103 0-2-.897-2-2zm40 0c0 1.103-.897 2-2 2H26V12h24c1.103 0 2 .897 2 2z");

  $svg.appendChild($path);

  return $svg;
}

export function arrowLeftSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-arrow-left`);
  $svg.setAttribute("viewBox", "0 0 500 500");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute("d", "M177.81 249.959L337.473 90.295c2.722-2.865 2.651-7.378-.143-10.1-2.793-2.65-7.163-2.65-9.956 0l-164.75 164.75c-2.793 2.793-2.793 7.306 0 10.1l164.75 164.75c2.865 2.722 7.378 2.65 10.099-.143 2.651-2.794 2.651-7.163 0-9.957L177.809 249.959z");

  $svg.appendChild($path);

  return $svg;
}

export function arrowRightSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-arrow-right`);
  $svg.setAttribute("viewBox", "0 0 500 500");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute("d", "M322.19 250.041L162.527 409.705c-2.722 2.865-2.651 7.378.143 10.1 2.793 2.65 7.163 2.65 9.956 0l164.75-164.75c2.793-2.793 2.793-7.306 0-10.1l-164.75-164.75c-2.865-2.722-7.378-2.65-10.099.143-2.651 2.794-2.651 7.163 0 9.957l159.664 159.736z");

  $svg.appendChild($path);

  return $svg;
}
