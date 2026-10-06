/* Catálogo compartilhado e persistente no Supabase. */
let catalogProducts = null;
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
function productCard(product, offer = false) {
    const price = product.offer_price ?? product.price;
    const discount = product.offer_price != null ? Math.round((1 - price / product.price) * 100) : 0;
    const el = document.createElement('div');
    el.className = offer ? 'offer-card' : 'product-card';
    el.dataset.category = product.categories.join(' ');
    el.dataset.offer = String(product.offer_price != null);
    el.dataset.featured = String(product.featured);
    const name = escapeHTML(product.name);
    el.innerHTML = `${discount ? `<span class="${offer ? 'offer-tag' : 'discount'}">-${discount}%</span>` : ''}
        <img src="${escapeHTML(product.image)}" alt="${name}" loading="lazy" decoding="async">
        <h4>${name}</h4><p>${escapeHTML(product.description)}</p>
        ${offer ? `<div class="prices"><span class="old-price">${formatBRL(product.price)}</span><span class="new-price">${formatBRL(price)}</span></div>` : `<div class="price">${product.offer_price != null ? `<small class="catalog-old-price">${formatBRL(product.price)}</small> ` : ''}${formatBRL(price)}</div>`}
        <button type="button"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> Adicionar ao pedido</button>`;
    const button = el.querySelector('button');
    Object.assign(button.dataset, {productId:product.id, productName:product.name, productPrice:String(price), productImg:product.image});
    return el;
}
async function fetchCatalogue() {
    return RafahCloud.catalog();
}
async function refreshCartCatalogue() {
    const data = await fetchCatalogue();
    catalogProducts = data.products.filter(p => p.active);
    reconcileCart();
}
async function loadCatalogue() {
    const data = await fetchCatalogue();
    catalogProducts = data.products.filter(p => p.active);
    const pageGrid = document.getElementById('products-grid-page');
    const homeGrid = document.querySelector('.products > .products-grid');
    const offersGrid = document.querySelector('.offers-grid');
    const recommendations = document.querySelector('.recommend-grid');
    const targets = [[pageGrid,catalogProducts,false], [homeGrid,catalogProducts.filter(p=>p.featured),false],
        [offersGrid,catalogProducts.filter(p=>p.offer_price != null),true], [recommendations,catalogProducts.filter(p=>p.featured).slice(0,4),false]];
    for (const [grid, products, offer] of targets) {
        if (!grid) continue;
        grid.replaceChildren(...products.map(p=>productCard(p,offer)));
        if (!products.length) {
            const message=document.createElement('p');message.className='catalog-empty';
            message.textContent=offer?'Nenhuma oferta cadastrada no momento.':'Nenhum produto disponível nesta seção.';grid.append(message);
        }
    }
    const categories = document.getElementById('category-filters');
    if (categories) {
        categories.replaceChildren();
        for (const category of [{id:'all',name:'Todos os produtos'}, ...data.categories]) {
            const count=catalogProducts.filter(p=>category.id==='all'||p.categories.includes(category.id)).length;
            const li=document.createElement('li');
            li.className=category.id==='all'?'active-filter':'';
            li.innerHTML=`<button type="button" data-filter="${escapeHTML(category.id)}" aria-pressed="${category.id==='all'}"><span>${escapeHTML(category.name)}</span><span class="category-count" aria-hidden="true">${count}</span></button>`;
            categories.append(li);
        }
    }
    reconcileCart();
}
function reconcileCart() {
    if (!catalogProducts) return;
    let changed=false;
    const cart=getCart().flatMap(item=>{
        const product=catalogProducts.find(p=>p.id===item.id);
        if (!product) {changed=true;return [];}
        const next={...item,name:product.name,price:product.offer_price??product.price,img:product.image};
        if (next.price!==item.price||next.name!==item.name||next.img!==item.img) changed=true;
        return [next];
    });
    if (changed) {
        saveCart(cart);
        showToast('Seu pedido foi atualizado conforme os preços e produtos disponíveis.');
    }
}
