/* O Vercel serve as páginas; Supabase Auth, Database e Storage guardam os dados. */
window.RafahCloud = (() => {
    let client;
    const bucket = 'rafah-produtos';
    const columns = 'id,name,description,price,offer_price,image,categories,featured,active,revision,position';
    function getClient() {
        if (client) return client;
        const config = window.RAFAH_CONFIG || {};
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') || !config.key) {
            throw new Error('O Supabase ainda não foi configurado. Gere config.js antes de publicar.');
        }
        if (!window.rafahSupabase) throw new Error('Não foi possível carregar a conexão do catálogo. Atualize a página.');
        client = window.rafahSupabase.createClient(config.url.replace(/\/$/, ''), config.key);
        return client;
    }
    function check(result) {
        if (result.error) {
            const message = result.error.message || '';
            if (/Invalid login credentials/i.test(message)) throw new Error('E-mail ou senha incorretos.');
            if (/Email not confirmed/i.test(message)) throw new Error('Confirme o e-mail do administrador no Supabase.');
            if (/row-level security|permission denied/i.test(message)) throw new Error('Esta conta não está autorizada a administrar o catálogo.');
            if (/rafah_products|rafah_categories|is_rafah_admin/i.test(message)) throw new Error('Execute o SQL de configuração no Supabase e tente novamente.');
            throw new Error('Não foi possível concluir a operação: ' + message);
        }
        return result.data;
    }
    async function isAdmin() {
        return !!check(await getClient().rpc('is_rafah_admin'));
    }
    async function session() {
        const data = check(await getClient().auth.getSession());
        if (!data.session) return {authenticated:false,csrf:''};
        const admin = await isAdmin();
        return {authenticated:admin,csrf:''};
    }
    async function requireAdmin() {
        const current = await session();
        if (!current.authenticated) {
            const error = new Error('Entre com o e-mail do administrador para continuar.');error.status=401;throw error;
        }
    }
    function imageURL(image) {
        if (!image) return '';
        if (image.startsWith('storage:')) {
            return getClient().storage.from(bucket).getPublicUrl(image.slice(8)).data.publicUrl;
        }
        // As imagens originais continuam na pasta img do site, com os mesmos nomes.
        if (/^img\/[a-zA-Z0-9._/-]+$/.test(image) && !image.includes('..')) return image;
        return '';
    }
    function display(product) {
        return {...product,price:Number(product.price),offer_price:product.offer_price==null?null:Number(product.offer_price),image_path:product.image,image:imageURL(product.image)};
    }
    async function catalog(admin=false) {
        if (admin) await requireAdmin();
        const db=getClient();
        const products=[];
        for(let offset=0; ; offset+=500) {
            let query=db.from('rafah_products').select(columns).order('position',{ascending:true}).range(offset,offset+499);
            if(!admin) query=query.eq('active',true);
            const page=check(await query);products.push(...page);
            if(page.length<500) break;
        }
        const categories=check(await db.from('rafah_categories').select('id,name').order('position',{ascending:true}));
        return {products:products.map(display),categories};
    }
    function validatedProduct(body) {
        const price=Number(body.price),offer=body.offer_price==null?null:Number(body.offer_price);
        if (!body.name?.trim() || body.name.trim().length>160 || String(body.description||'').length>600) throw new Error('Confira o nome e a descrição do produto.');
        if (!Number.isFinite(price)||price<=0||price>100000) throw new Error('Informe um preço válido.');
        if (offer!=null&&(!Number.isFinite(offer)||offer<=0||offer>=price)) throw new Error('O preço da oferta deve ser menor que o preço normal.');
        if (!Array.isArray(body.categories)||!body.categories.length) throw new Error('Selecione pelo menos uma categoria.');
        return {name:body.name.trim(),description:String(body.description||'').trim(),price,offer_price:offer,categories:body.categories,image:body.image,active:body.active===true,featured:body.featured===true};
    }
    async function upload(body) {
        let raw;
        try {raw=Uint8Array.from(atob(body.data),char=>char.charCodeAt(0));}catch{throw new Error('Imagem inválida.');}
        if (!raw.length||raw.length>2000000) throw new Error('Use uma imagem de até 2 MB.');
        const starts=bytes=>bytes.every((byte,index)=>raw[index]===byte);
        let mime,extension;
        if(starts([137,80,78,71,13,10,26,10])){mime='image/png';extension='png';}
        else if(starts([255,216,255])){mime='image/jpeg';extension='jpg';}
        else if(starts([82,73,70,70])&&raw[8]===87&&raw[9]===69&&raw[10]===66&&raw[11]===80){mime='image/webp';extension='webp';}
        else throw new Error('Use uma imagem PNG, JPG ou WebP.');
        const path=crypto.randomUUID()+'.'+extension;
        check(await getClient().storage.from(bucket).upload(path,new Blob([raw],{type:mime}),{contentType:mime,upsert:false}));
        return {image:'storage:'+path};
    }
    async function api(path,method='GET',body) {
        if (path==='/api/sessao') return session();
        if (path==='/api/login') {
            const db=getClient();check(await db.auth.signInWithPassword({email:body.username.trim(),password:body.password}));
            if (!await isAdmin()) {await db.auth.signOut();throw new Error('Este e-mail não foi autorizado no SQL de configuração.');}
            return {authenticated:true,csrf:''};
        }
        if (path==='/api/logout') {check(await getClient().auth.signOut());return {ok:true};}
        if (path==='/api/admin/produtos'&&method==='GET') return catalog(true);
        await requireAdmin();
        if (path==='/api/admin/imagens'&&method==='POST') return upload(body);
        const table=getClient().from('rafah_products');
        if (path==='/api/admin/produtos'&&method==='POST') {
            const product=check(await table.insert({...validatedProduct(body),id:'produto-'+crypto.randomUUID()}).select(columns).single());
            return {product:display(product)};
        }
        const prefix='/api/admin/produtos/';
        if (path.startsWith(prefix)&&['PUT','DELETE'].includes(method)) {
            const id=decodeURIComponent(path.slice(prefix.length));
            let query=method==='DELETE'?table.delete():table.update(validatedProduct(body));
            const result=check(await query.eq('id',id).eq('revision',body.revision).select(columns));
            if (!result.length) throw new Error('Este produto foi alterado ou excluído em outra aba. Atualize a lista.');
            return method==='DELETE'?{ok:true}:{product:display(result[0])};
        }
        throw new Error('Operação não encontrada.');
    }
    return {api,catalog,imageURL,getClient};
})();
