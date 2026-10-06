/* Painel administrativo conectado ao Supabase. */
const $ = id => document.getElementById(id);
let csrf = '', products = [], categories = [], editing = null, deleting = null;
let selectedFile = null, imagePath = '', previewURL = '', busy = false, fileVersion = 0;
const money = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function status(id, message, error = false) {
    $(id).textContent = message; $(id).classList.toggle('error', error);
}
function showLogin() {
    if ($('product-dialog').open) $('product-dialog').close();
    if ($('delete-dialog').open) $('delete-dialog').close();
    $('dashboard').hidden = true; $('login-panel').hidden = false; $('logout').hidden = true;
}
async function api(path, method='GET', body) {
    try { return await RafahCloud.api(path, method, body); }
    catch (error) {
        if (error.status===401) {showLogin();status('login-status','Entre novamente com o e-mail do administrador.',true);}
        throw error;
    }
}
async function refresh() {
    const data=await api('/api/admin/produtos'); products=data.products; categories=data.categories;
    $('total-products').textContent=products.length;
    $('active-products').textContent=products.filter(p=>p.active).length;
    $('offer-products').textContent=products.filter(p=>p.active&&p.offer_price!=null).length;
    drawTable();
}
function textCell(value) {const cell=document.createElement('td');cell.textContent=value;return cell;}
function drawTable() {
    const term=normalize($('admin-search').value), filter=$('admin-filter').value;
    const visible=products.filter(p=>normalize(p.name+' '+p.description).includes(term) &&
        (filter==='all'||filter==='offers'&&p.offer_price!=null||filter==='active'&&p.active||filter==='hidden'&&!p.active));
    $('product-rows').replaceChildren();$('empty-list').hidden=visible.length>0;
    for (const p of visible) {
        const row=document.createElement('tr');
        const cell=document.createElement('td'), info=document.createElement('div');info.className='product-cell';
        const img=document.createElement('img');img.src=p.image;img.alt='';img.loading='lazy';
        const details=document.createElement('div'), name=document.createElement('strong'), category=document.createElement('small');
        name.textContent=p.name;category.textContent=p.categories.map(key=>categories.find(c=>c.id===key)?.name||key).join(' • ');
        details.append(name,category);info.append(img,details);cell.append(info);row.append(cell,textCell(money(p.price)),textCell(p.offer_price==null?'—':money(p.offer_price)));
        const active=document.createElement('td'), badge=document.createElement('span');badge.className='badge'+(p.active?'':' off');badge.textContent=p.active?'Visível':'Oculto';active.append(badge);row.append(active);
        const actions=document.createElement('td'), container=document.createElement('div');container.className='actions';
        const edit=document.createElement('button');edit.className='secondary';edit.textContent='Editar';edit.setAttribute('aria-label','Editar '+p.name);edit.onclick=()=>openEditor(p);
        const remove=document.createElement('button');remove.className='delete-button';remove.textContent='Excluir';remove.setAttribute('aria-label','Excluir '+p.name);remove.onclick=()=>openDelete(p);
        container.append(edit,remove);actions.append(container);row.append(actions);$('product-rows').append(row);
    }
}
function setPreview(src) {
    if (previewURL) {URL.revokeObjectURL(previewURL);previewURL='';}
    $('image-preview').hidden=!src;$('image-placeholder').hidden=!!src;
    if(src) $('image-preview').src=src; else $('image-preview').removeAttribute('src');
}
function updateOffer() {
    const offer=$('product-is-offer').checked;
    $('offer-price-group').hidden=!offer;$('product-offer').required=offer;
    const normal=Number($('product-price').value), price=Number($('product-offer').value);
    $('discount-preview').textContent=offer&&normal>0&&price>0&&price<normal?`Desconto de ${Math.round((1-price/normal)*100)}%. O produto aparecerá na página de ofertas.`:'';
}
function openEditor(product=null) {
    editing=product;selectedFile=null;imagePath=product?.image_path||product?.image||'';fileVersion++;
    $('product-form').reset();status('form-status','');
    $('editor-title').textContent=product?'Editar produto':'Novo produto';
    $('product-name').value=product?.name||'';$('product-description').value=product?.description||'';
    $('product-price').value=product?.price??'';$('product-offer').value=product?.offer_price??'';
    $('product-is-offer').checked=product?.offer_price!=null;
    $('product-active').checked=product?.active??true;$('product-featured').checked=product?.featured??false;
    $('product-categories').replaceChildren();
    categories.forEach(c=>{
        const label=document.createElement('label');label.className='check';
        const input=document.createElement('input');input.type='checkbox';input.name='category';input.value=c.id;input.checked=product?.categories.includes(c.id)||false;
        label.append(input,document.createTextNode(c.name));$('product-categories').append(label);
    });
    setPreview(imagePath ? RafahCloud.imageURL(imagePath) : '');updateOffer();$('product-dialog').showModal();$('product-name').focus();
}
function closeEditor() {if(!busy){$('product-dialog').close();setPreview('');fileVersion++;}}
function openDelete(product) {
    deleting=product;status('delete-status','');$('delete-description').textContent=`Deseja excluir “${product.name}”?`;
    $('delete-dialog').showModal();$('cancel-delete').focus();
}
function toBase64(file) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});
}
$('product-image').addEventListener('change',async()=>{
    const version=++fileVersion, file=$('product-image').files[0];selectedFile=null;
    if(!file){setPreview(imagePath ? RafahCloud.imageURL(imagePath) : '');return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2000000){
        status('form-status','Escolha uma imagem JPG, PNG ou WebP de até 2 MB.',true);$('product-image').value='';setPreview(imagePath ? RafahCloud.imageURL(imagePath) : '');return;
    }
    const url=URL.createObjectURL(file);
    try {
        await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth>0&&image.naturalWidth<=16000&&image.naturalHeight<=16000?resolve():reject();image.onerror=reject;image.src=url;});
        if(version!==fileVersion){URL.revokeObjectURL(url);return;}
        selectedFile=file;setPreview('');previewURL=url;$('image-preview').src=url;$('image-preview').hidden=false;$('image-placeholder').hidden=true;status('form-status','Imagem selecionada. Clique em Salvar produto.');
    } catch {URL.revokeObjectURL(url);if(version===fileVersion){$('product-image').value='';setPreview(imagePath ? RafahCloud.imageURL(imagePath) : '');status('form-status','Não foi possível abrir essa imagem. Escolha outra foto.',true);}}
});
$('product-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const selected=Array.from(document.querySelectorAll('[name=category]:checked'),input=>input.value);
    if(!selected.length){status('form-status','Selecione pelo menos uma categoria.',true);$('product-categories').querySelector('input').focus();return;}
    const price=Number($('product-price').value), offer=$('product-is-offer').checked?Number($('product-offer').value):null;
    if(offer!=null&&offer>=price){status('form-status','O preço da oferta deve ser menor que o preço normal.',true);$('product-offer').focus();return;}
    if(!imagePath&&!selectedFile){status('form-status','Escolha a foto do produto.',true);$('product-image').focus();return;}
    busy=true;$('save-product').disabled=true;status('form-status','Salvando produto…');
    // Bloqueia os campos para que o cadastro não mude durante o envio.
    const controls=Array.from($('product-form').querySelectorAll('input,textarea,button'));controls.forEach(el=>el.disabled=true);
    try {
        if(selectedFile){const result=await api('/api/admin/imagens','POST',{data:await toBase64(selectedFile)});imagePath=result.image;selectedFile=null;}
        const body={name:$('product-name').value.trim(),description:$('product-description').value.trim(),price,offer_price:offer,categories:selected,image:imagePath,active:$('product-active').checked,featured:$('product-featured').checked};
        if(editing)body.revision=editing.revision;
        await api('/api/admin/produtos'+(editing?'/'+encodeURIComponent(editing.id):''),editing?'PUT':'POST',body);
        $('product-dialog').close();setPreview('');
        await refresh();status('dashboard-status','Produto salvo. Atualize a página do site para ver a alteração.');
    } catch(error){status('form-status',error.message,true);}
    finally{busy=false;controls.forEach(el=>el.disabled=false);}
});
$('login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;status('login-status','Entrando…');
    try {const data=await api('/api/login','POST',{username:$('username').value,password:$('password').value});csrf=data.csrf;await refresh();$('login-panel').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;$('password').value='';status('login-status','');}
    catch(error){status('login-status',error.message,true);}finally{button.disabled=false;}
});
$('logout').onclick=async()=>{try{await api('/api/logout','POST',{});csrf='';showLogin();status('login-status','Você saiu do painel.');}catch(error){status('dashboard-status',error.message,true);}};
$('new-product').onclick=()=>openEditor();$('close-editor').onclick=closeEditor;$('cancel-editor').onclick=closeEditor;
$('product-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('admin-search').oninput=drawTable;$('admin-filter').onchange=drawTable;
$('product-is-offer').onchange=updateOffer;$('product-price').oninput=updateOffer;$('product-offer').oninput=updateOffer;
$('refresh').onclick=async()=>{try{await refresh();status('dashboard-status','Lista atualizada.');}catch(error){status('dashboard-status',error.message,true);}};
$('cancel-delete').onclick=()=>$('delete-dialog').close();
$('confirm-delete').onclick=async()=>{
    if(!deleting)return;$('confirm-delete').disabled=true;
    try{await api('/api/admin/produtos/'+encodeURIComponent(deleting.id),'DELETE',{revision:deleting.revision});$('delete-dialog').close();await refresh();status('dashboard-status','Produto excluído.');}
    catch(error){status('delete-status',error.message,true);}finally{$('confirm-delete').disabled=false;}
};
(async()=>{
    try{const session=await api('/api/sessao');if(session.authenticated){csrf=session.csrf;await refresh();$('login-panel').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;}}
    catch(error){status('login-status',error.message,true);}
})();
