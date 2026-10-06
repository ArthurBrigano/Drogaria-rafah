/* =========================================================
   FARMÁCIA RAFAH+ — script.js
   Carrinho de compras real (localStorage) + checkout via WhatsApp
   ========================================================= */

/* ---------- CONFIGURAÇÃO ---------- */
// Número de WhatsApp da farmácia (com DDI 55 + DDD + número, só dígitos)
const WHATSAPP_NUMBER = "5514997979499";

const CART_STORAGE_KEY = "rafahmais_cart";
// Entrega sempre grátis, para toda cidade.

/* ---------- UTIL ---------- */

function formatBRL(value) {
    return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}

function parsePriceToNumber(priceText) {
    // Converte "R$ 23,90" -> 23.90
    return Number(
        priceText
            .replace(/[^\d,.-]/g, "")
            .replace(".", "")
            .replace(",", ".")
    );
}

/* ---------- CARRINHO: leitura/escrita no localStorage ---------- */

function getCart() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Erro ao ler carrinho:", e);
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartCountBadge();
}

function addToCart({ id, name, price, img }, qty = 1) {
    const cart = getCart();
    const existing = cart.find((item) => item.id === id);

    if (existing) {
        existing.qty += qty;
        Object.assign(existing, {name, price, img});
    } else {
        cart.push({ id, name, price, img, qty });
    }

    saveCart(cart);
    showToast(`${name} adicionado ao carrinho!`);
}

function removeFromCart(id) {
    const cart = getCart().filter((item) => item.id !== id);
    saveCart(cart);
    renderCartPage();
}

function changeQty(id, delta) {
    const cart = getCart();
    const item = cart.find((p) => p.id === id);

    if (!item) return;

    item.qty += delta;

    if (item.qty < 1) {
        removeFromCart(id);
        return;
    }

    saveCart(cart);
    renderCartPage();
}

function getCartTotals() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const shipping = 0; // frete sempre grátis
    const total = subtotal + shipping;

    return { totalItems, subtotal, shipping, total };
}

/* ---------- BADGE DO CARRINHO (contador no header, em todas as páginas) ---------- */

function updateCartCountBadge() {
    const { totalItems } = getCartTotals();
    document.querySelectorAll("#cart-count").forEach((el) => {
        el.textContent = totalItems;
    });
}

/* ---------- TOAST DE FEEDBACK (substitui o alert()) ---------- */

function showToast(message) {
    let toast = document.querySelector(".rafah-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.className = "rafah-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

/* ---------- BOTÕES "COMPRAR" / "ADICIONAR" (produtos, ofertas, index, recomendados) ---------- */

function setupAddToCartButtons() {
    const buttons = document.querySelectorAll("[data-product-id]");

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const id = button.dataset.productId;
            const name = button.dataset.productName;
            const price = Number(button.dataset.productPrice);
            const img = button.dataset.productImg || "";

            addToCart({ id, name, price, img });
        });
    });
}

/* ---------- PÁGINA DO CARRINHO ---------- */

function renderCartPage() {
    const cartItemsContainer = document.getElementById("cart-items-container");

    // Só executa se estivermos na página do carrinho
    if (!cartItemsContainer) return;

    const cart = getCart();
    const { totalItems, subtotal, shipping, total } = getCartTotals();

    const cartTitleCount = document.getElementById("cart-title-count");
    const subtotalEl = document.getElementById("cart-subtotal");
    const shippingEl = document.getElementById("cart-shipping");
    const totalEl = document.getElementById("cart-total");
    const emptyMsg = document.getElementById("cart-empty-message");
    const finishBtn = document.getElementById("finish-order-btn");

    if (cartTitleCount) {
        cartTitleCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "itens"}`;
    }

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = "";
        if (emptyMsg) emptyMsg.style.display = "flex";
        if (finishBtn) finishBtn.disabled = true;
    } else {
        if (emptyMsg) emptyMsg.style.display = "none";
        if (finishBtn) finishBtn.disabled = false;

        cartItemsContainer.innerHTML = cart
            .map(
                (item) => `
            <div class="cart-product">
                ${item.img ? `<img src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}">` : ""}
                <div class="cart-product-info">
                    <h3>${escapeHTML(item.name)}</h3>
                    <span class="product-price">${formatBRL(item.price)}</span>
                </div>
                <div class="quantity-box">
                    <button data-action="decrease" data-id="${escapeHTML(item.id)}">-</button>
                    <span>${item.qty}</span>
                    <button data-action="increase" data-id="${escapeHTML(item.id)}">+</button>
                </div>
                <button class="remove-item-btn" data-action="remove" data-id="${escapeHTML(item.id)}" title="Remover item">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `
            )
            .join("");

        // Eventos dos botões +/- e remover
        cartItemsContainer.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;

                if (action === "increase") changeQty(id, 1);
                if (action === "decrease") changeQty(id, -1);
                if (action === "remove") removeFromCart(id);
            });
        });
    }

    if (subtotalEl) subtotalEl.textContent = formatBRL(subtotal);
    if (totalEl) totalEl.textContent = formatBRL(total);

    if (shippingEl) {
        shippingEl.textContent = shipping === 0 ? "GRÁTIS" : formatBRL(shipping);
        shippingEl.classList.toggle("free-delivery", shipping === 0);
    }
}

/* ---------- FINALIZAR PEDIDO -> WHATSAPP ---------- */

function setupFinishOrderButton() {
    const finishBtn = document.getElementById("finish-order-btn");

    if (!finishBtn) return;

    finishBtn.addEventListener("click", async () => {
        finishBtn.disabled = true;
        try {
            await refreshCartCatalogue();
            renderCartPage();
        } catch (error) {
            showToast("Não foi possível conferir o pedido. Confira sua conexão e tente novamente.");
            finishBtn.disabled = false;
            return;
        }
        const cart = getCart();

        if (cart.length === 0) {
            showToast("Seu carrinho está vazio.");
            return;
        }

        const { subtotal, shipping, total } = getCartTotals();

        let message = "Olá, Farmácia Rafah+! 👋\nGostaria de fazer o seguinte pedido:\n\n";

        cart.forEach((item) => {
            message += `• ${item.qty}x ${item.name} — ${formatBRL(item.price)} (un.) | ${formatBRL(item.qty * item.price)}\n`;
        });

        message += `\nSubtotal: ${formatBRL(subtotal)}`;
        message += `\nEntrega: ${shipping === 0 ? "Grátis" : formatBRL(shipping)}`;
        message += `\n*Total estimado: ${formatBRL(total)}*`;
        message += "\n\nPodem confirmar os preços, a disponibilidade e combinar a entrega ou retirada? Obrigado(a)!";

        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        window.location.href = url;
    });
}

/* ---------- CONTINUAR COMPRANDO ---------- */

function setupContinueShoppingButton() {
    const continueBtn = document.getElementById("continue-shopping-btn");
    if (continueBtn) {
        continueBtn.addEventListener("click", () => {
            window.location.href = "produtos.html";
        });
    }
}

/* =========================================================
   PÁGINA DE PRODUTOS — categoria, ordenação e busca reais
   ========================================================= */

function normalizeText(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

let currentCategory = "all";
let currentSearchTerm = "";

function applyProductFiltersAndSort() {
    const grid = document.getElementById("products-grid-page");
    if (!grid) return;

    const sortSelect = document.getElementById("sort-select");
    const noProductsMsg = document.getElementById("no-products-message");
    const sortValue = sortSelect ? sortSelect.value : "relevantes";

    const cards = Array.from(grid.querySelectorAll(".product-card"));

    // Guarda a ordem original (para "Mais relevantes" / "Mais vendidos")
    cards.forEach((card, index) => {
        if (!card.dataset.originalOrder) {
            card.dataset.originalOrder = index;
        }
    });

    // Define quais cards batem com a categoria + busca atuais
    let visibleCount = 0;

    cards.forEach((card) => {
        // Um produto pode aparecer em mais de uma categoria.
        const cardCategories = (card.dataset.category || "").split(/\s+/);
        const productName = card.querySelector("h4")?.textContent || "";
        const productDesc = card.querySelector("p")?.textContent || "";
        const searchable = normalizeText(productName + " " + productDesc);

        const matchesCategory =
            currentCategory === "all" || cardCategories.includes(currentCategory);
        const matchesSearch =
            currentSearchTerm === "" || searchable.includes(currentSearchTerm);

        const matchesOffer = !document.getElementById("offers-only")?.checked || card.dataset.offer === "true";
        const matchesFeatured = !document.getElementById("featured-only")?.checked || card.dataset.featured === "true";
        const matches = matchesCategory && matchesSearch && matchesOffer && matchesFeatured;
        card.style.display = matches ? "" : "none";
        if (matches) visibleCount++;
    });

    // Reordena todos os cards conforme o select
    const sorted = [...cards].sort((a, b) => {
        if (sortValue === "menor-preco" || sortValue === "maior-preco") {
            const priceA = Number(
                a.querySelector("[data-product-price]")?.dataset.productPrice || 0
            );
            const priceB = Number(
                b.querySelector("[data-product-price]")?.dataset.productPrice || 0
            );
            return sortValue === "menor-preco" ? priceA - priceB : priceB - priceA;
        }

        // "relevantes" e "mais-vendidos" mantêm a ordem original do catálogo
        return Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder);
    });

    sorted.forEach((card) => grid.appendChild(card));

    if (noProductsMsg) {
        noProductsMsg.style.display = visibleCount === 0 ? "block" : "none";
    }
}

function setupProductFilters() {
    const grid = document.getElementById("products-grid-page");
    if (!grid) return; // só roda em produtos.html

    // Botões nativos também funcionam com Tab, Enter e Espaço.
    const categoryButtons = document.querySelectorAll("#category-filters button[data-filter]");
    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            categoryButtons.forEach((item) => {
                item.closest("li").classList.remove("active-filter");
                item.setAttribute("aria-pressed", "false");
            });
            button.closest("li").classList.add("active-filter");
            button.setAttribute("aria-pressed", "true");
            currentCategory = button.dataset.filter || "all";
            applyProductFiltersAndSort();
        });
    });

    document.querySelectorAll("#offers-only, #featured-only").forEach(input => input.addEventListener("change", applyProductFiltersAndSort));

    // Ordenação
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", applyProductFiltersAndSort);
    }

    // Se veio de uma busca feita em outra página (?busca=...)
    const params = new URLSearchParams(window.location.search);
    const queryFromUrl = params.get("busca");

    if (queryFromUrl) {
        const searchInput = document.querySelector(".search-box input");
        if (searchInput) searchInput.value = queryFromUrl;
        currentSearchTerm = normalizeText(queryFromUrl);
    }

    applyProductFiltersAndSort();
}

/* ---------- BARRA DE BUSCA (todas as páginas) ---------- */

function setupSearchBox() {
    const searchInput = document.querySelector(".search-box input");
    const searchButton = document.querySelector(".search-box button");

    if (!searchInput || !searchButton) return;

    const isOnProductsPage = !!document.getElementById("products-grid-page");

    function runSearch() {
        const term = searchInput.value.trim();

        if (term === "") {
            showToast("Digite o nome de um remédio ou produto.");
            return;
        }

        if (isOnProductsPage) {
            currentSearchTerm = normalizeText(term);
            applyProductFiltersAndSort();
        } else {
            window.location.href = `produtos.html?busca=${encodeURIComponent(term)}`;
        }
    }

    searchButton.addEventListener("click", runSearch);

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            runSearch();
        }
    });
}

/* =========================================================
   FUNCIONALIDADES JÁ EXISTENTES NO SITE (mantidas)
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    setupHomeCarousel();
    try { await loadCatalogue(); } catch (error) {
        document.querySelectorAll(".products-grid, .offers-grid, #products-grid-page, .recommend-grid").forEach(grid => { grid.textContent = "Não foi possível carregar os produtos. Confira a conexão com o Supabase e atualize a página."; });
        showToast("Não foi possível carregar o catálogo. Atualize a página.");
    }
    /* Botões de quantidade genéricos (fora do carrinho, se existirem) */
    const quantityButtons = document.querySelectorAll(
        ".quantity-box button:not([data-action])"
    );

    quantityButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const quantityText = button.parentElement.querySelector("span");
            let quantity = Number(quantityText.innerText);

            if (button.innerText === "+") {
                quantity++;
            } else if (quantity > 1) {
                quantity--;
            }

            quantityText.innerText = quantity;
        });
    });

    /* FAQ */
    const faqItems = document.querySelectorAll(".faq-item");

    faqItems.forEach((item) => {
        const question = item.querySelector(".faq-question");
        question.addEventListener("click", () => {
            item.classList.toggle("active-faq");
        });
    });

    /* Formulário de contato */
    const forms = document.querySelectorAll("form");

    forms.forEach((form) => {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            showToast("Ação realizada com sucesso!");
            form.reset();
        });
    });

    /* Hover nos cards de produto */
    const productCards = document.querySelectorAll(
        ".product-card, .offer-card, .recommend-card"
    );

    productCards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
            card.style.transform = "translateY(-8px)";
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "translateY(0px)";
        });
    });

    /* Sombra no header ao rolar a página */
    window.addEventListener("scroll", () => {
        const header = document.querySelector(".header");
        if (!header) return;

        header.style.boxShadow =
            window.scrollY > 20 ? "0 5px 20px rgba(0,0,0,0.08)" : "none";
    });

    /* ---------- INICIALIZAÇÃO DO CARRINHO ---------- */
    setupAddToCartButtons();
    updateCartCountBadge();
    renderCartPage();
    setupFinishOrderButton();
    setupContinueShoppingButton();

    /* ---------- INICIALIZAÇÃO DE PRODUTOS (filtro, ordenação, busca) ---------- */
    setupProductFilters();
    setupSearchBox();
});

/* Carrossel automático com setas e indicadores. */
function setupHomeCarousel() {
    const carousel = document.querySelector('.home-carousel');
    if (!carousel) return;
    const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
    const dots = Array.from(carousel.querySelectorAll('[data-carousel-index]'));
    if (!slides.length) return;
    let current = 0;
    let timer;
    function show(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach((slide, i) => { slide.hidden = i !== current; });
        dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === current)));
    }
    function restart() {
        clearInterval(timer);
        timer = setInterval(() => { if (!document.hidden) show(current + 1); }, 6000);
    }
    function navigate(index) { show(index); restart(); }
    carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => navigate(current - 1));
    carousel.querySelector('[data-carousel-next]').addEventListener('click', () => navigate(current + 1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => navigate(i)));
    show(0);
    restart();
}
