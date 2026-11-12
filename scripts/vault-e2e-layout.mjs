export async function layoutCheckScript(skipRiskStatus = false) {
  const tolerance = 4;
  const scope = document.querySelector("[data-vault-e2e-scope='vault-preview']") || document.body;
  const issues = [];
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };

  const addIssue = (ruleId, message, extra = {}) => issues.push({ ruleId, message, ...extra });
  const isRendered = (element, minSize = 1) => {
    const rect = element.getBoundingClientRect();
    return rect.width > minSize && rect.height > minSize &&
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const selectorFor = (element) => {
    if (element.id) return `#${element.id}`;
    const dataUi = element.getAttribute("data-flap-ui");
    if (dataUi) return `[data-flap-ui="${dataUi}"]`;
    return element.tagName.toLowerCase();
  };
  const rectInfo = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  const getVisibleControls = (elements) => {
    if (elements.length === 0) return [];
    // Let Chromium apply viewport and scrollport clipping using the actual
    // containing blocks, including for positioned descendants.
    return new Promise((resolve) => {
      const rects = new Map();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          rects.set(entry.target, entry.intersectionRect);
          observer.unobserve(entry.target);
        }
        if (rects.size === elements.length) {
          observer.disconnect();
          resolve(elements.map((element) => ({ element, rect: rects.get(element) }))
            .filter(({ rect }) => rect.width > 0 && rect.height > 0));
        }
      });
      for (const element of elements) observer.observe(element);
    });
  };
  const isNextDevIndicator = (element, x, y) => {
    if (element.localName !== "nextjs-portal" || scope.contains(element)) return false;
    return Boolean(element.shadowRoot?.elementFromPoint(x, y)?.closest("[data-nextjs-dev-tools-button]"));
  };

  if (scope.scrollWidth > scope.clientWidth + tolerance) {
    addIssue("layout/horizontal-overflow", "Vault business UI has horizontal overflow.", {
      scrollWidth: scope.scrollWidth,
      clientWidth: scope.clientWidth,
    });
  }

  const scopeRect = scope.getBoundingClientRect();
  if (scopeRect.left < -tolerance || scopeRect.right > viewport.width + tolerance) {
    addIssue("layout/scope-out-of-viewport", "Vault preview scope extends outside the viewport.", {
      rect: rectInfo(scopeRect),
      viewport,
    });
  }

  const textElements = Array.from(scope.querySelectorAll("button, a, label, p, span, h1, h2, h3, h4, h5, h6, [data-flap-ui]"))
    .filter((element) => isRendered(element))
    .filter((element) => (element.textContent || "").trim().length > 0);
  for (const element of textElements) {
    const style = window.getComputedStyle(element);
    const clipsX = element.scrollWidth > element.clientWidth + tolerance && style.overflowX !== "visible";
    const clipsY = element.scrollHeight > element.clientHeight + tolerance && style.overflowY !== "visible";
    const intentionalEllipsis = style.textOverflow === "ellipsis" && style.whiteSpace === "nowrap" &&
      ["hidden", "clip"].includes(style.overflowX);
    if ((clipsX && !intentionalEllipsis) || clipsY) {
      addIssue("layout/text-overflow", "Visible text appears clipped or overflowing its container.", {
        selector: selectorFor(element),
        text: (element.textContent || "").trim().slice(0, 120),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
    }
  }

  const controls = Array.from(scope.querySelectorAll("button, input, textarea, select, a[href], [role='button']"))
    .filter((element) => isRendered(element, 6));
  const visibleControls = await getVisibleControls(controls);
  for (const { element, rect } of visibleControls) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hits = document.elementsFromPoint(centerX, centerY);
    // A clipped or non-hit-testable point cannot be covered by another element.
    if (!hits.some((hit) => element.contains(hit))) continue;
    const topElement = hits.find((hit) => !isNextDevIndicator(hit, centerX, centerY));
    if (topElement && topElement !== element && !element.contains(topElement) && !topElement.contains(element)) {
      addIssue("layout/control-covered", "A visible control is covered by another element at its center point.", {
        selector: selectorFor(element),
        coveringSelector: selectorFor(topElement),
        rect: rectInfo(rect),
      });
    }
  }

  for (let leftIndex = 0; leftIndex < visibleControls.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < visibleControls.length; rightIndex += 1) {
      const left = visibleControls[leftIndex];
      const right = visibleControls[rightIndex];
      if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
      const overlapX = Math.max(0, Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left));
      const overlapY = Math.max(0, Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top));
      const overlapArea = overlapX * overlapY;
      if (overlapArea > 24) {
        addIssue("layout/control-overlap", "Two visible controls overlap.", {
          left: selectorFor(left.element),
          right: selectorFor(right.element),
          overlapArea: Math.round(overlapArea),
        });
      }
    }
  }

  let riskElement = null;
  if (!skipRiskStatus) {
    const riskRegex = /risk|风险|unverified|未验证|missing|缺失|低风险|高风险|中风险/i;
    riskElement = textElements.find((element) => riskRegex.test((element.textContent || "").trim()));
    if (!riskElement) {
      addIssue("layout/risk-status-not-visible", "No visible risk status text was found in the Vault business UI.");
    } else {
      const riskRect = riskElement.getBoundingClientRect();
      if (riskRect.top - scopeRect.top > 420) {
        addIssue("layout/risk-status-too-low", "Risk status is visible but too low in the Vault business UI.", {
          riskTopWithinScope: Math.round(riskRect.top - scopeRect.top),
        });
      }
    }
  }

  return {
    issues,
    metrics: {
      documentScrollWidth: scope.scrollWidth,
      documentClientWidth: scope.clientWidth,
      controlCount: controls.length,
      textNodeCount: textElements.length,
      riskVisible: skipRiskStatus ? true : Boolean(riskElement),
    },
  };
}
