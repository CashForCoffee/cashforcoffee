const SUPABASE_URL='https://iadncppgdpdiucrhdbxw.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_Yc5UXSbMl1L_rdY6LWd81A_K36QaZ62';
let AUTH_LINK_TYPE=new URLSearchParams(location.hash.slice(1)).get('type')||new URLSearchParams(location.search).get('type')||'';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let cashflowChart=null,realtimeChannel=null;
let state={items:[],settings:null,session:null,authMode:'login',itemsLoaded:false,view:'dashboard',selectedPeriod:null,search:'',filter:'all',category:'all',type:'all',allSearch:'',allCategory:'all',allType:'all',allPaid:'all',modal:null,tab:'settings',editing:null,importParsed:null,busy:false,sync:'',pending:new Set(),bulkScope:'future',hidePast:localStorage.getItem('cfcHidePast')!=='false'};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=n=>(Number(n)<0?'-':'')+'$'+Math.abs(Number(n)||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const DAY_MS=86400000;
function dateToDay(v){const [y,m,d]=String(v).slice(0,10).split('-').map(Number);return Math.floor(Date.UTC(y,m-1,d)/DAY_MS)}
function dayToISO(day){return new Date(day*DAY_MS).toISOString().slice(0,10)}
function todayDay(){const n=new Date();return Math.floor(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())/DAY_MS)}
function shortDate(v){return new Date(v+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
function fullDate(v){return new Date(v+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit'})}
function periodLabel(p){return `${shortDate(p.start)} – ${fullDate(p.end)}`}function dateContext(v){const diff=dateToDay(v)-todayDay();if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';if(diff>1&&diff<=13)return`In ${diff} days`;if(diff<-1&&diff>=-13)return`${Math.abs(diff)} days ago`;return''}
function brandmark(){return `<div class="brandmark"><img src="assets/logo/cashforcoffee-logo.png" alt=""></div>`}
function icon(name,cls=''){return `<i data-lucide="${name}" class="icon-svg ${cls}"></i>`}
function inferredType(category){return String(category||'').trim().toLowerCase()==='income'?'Income':'Expense'}

function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1400)}
function fail(error,context='Something went wrong'){console.error(error);state.sync='error';renderTopSync();alert(`${context}. ${error?.message||''}`.trim())}
function renderTopSync(){const el=document.querySelector('.sync-state');if(!el)return;el.className='sync-state'+(state.sync?' '+state.sync:'');el.textContent=state.sync==='saving'?'Saving…':state.sync==='error'?'Not saved':''}
function currentIdx(){return Math.floor((todayDay()-dateToDay(state.settings.anchor))/14)}
function chronologicalItemSort(a,b){
  const dateDiff=dateToDay(a.date)-dateToDay(b.date);
  if(dateDiff!==0)return dateDiff;
  const itemDiff=String(a.item||'').trim().localeCompare(String(b.item||'').trim(),'en-AU',{numeric:true,sensitivity:'base'});
  if(itemDiff!==0)return itemDiff;
  return String(a.id||'').localeCompare(String(b.id||''));
}
const itemSort=chronologicalItemSort;
const allItemSort=chronologicalItemSort;

function isMainIncome(i){return String(i.item||'').trim().toLowerCase()==='1. main income'}
function buildPeriods(){
  if(!state.settings)return[];
  const anchorDay=dateToDay(state.settings.anchor),nowIdx=currentIdx(),forecast=Number(state.settings.forecast_periods)||26;
  const itemIdxs=state.items.map(i=>Math.floor((dateToDay(i.date)-anchorDay)/14));
  const minItem=itemIdxs.length?Math.min(...itemIdxs):nowIdx,maxItem=itemIdxs.length?Math.max(...itemIdxs):nowIdx;
  const first=Math.min(nowIdx,minItem,0),last=Math.max(nowIdx+forecast-1,maxItem,0),out=[];
  let running=Number(state.settings.starting_balance)||0;
  for(let idx=first;idx<=last;idx++){
    const startDay=anchorDay+idx*14,endDay=startDay+13;
    const items=state.items.filter(i=>{const d=dateToDay(i.date);return d>=startDay&&d<=endDay}).sort(itemSort);
    const income=items.filter(i=>i.type==='Income').reduce((s,i)=>s+Number(i.amount),0);
    const expenses=items.filter(i=>i.type!=='Income').reduce((s,i)=>s+Number(i.amount),0);
    const net=income-expenses;
    running+=net;
    out.push({idx,start:dayToISO(startDay),end:dayToISO(endDay),items,income,expenses,net,balance:running});
  }
  return out;
}
function selectedPeriod(ps){const idx=state.selectedPeriod??currentIdx();return ps.find(p=>p.idx===idx)||ps[0]}
function categoryClass(category){const c=String(category||'').trim().toLowerCase();if(c==='income')return 'pill-income';if(c==='savings & sinking funds')return 'pill-savings';if(c.startsWith('fixed essential'))return 'pill-fixed';if(c==='birthdays')return 'pill-birthdays';return ''}
function categories(){return [...new Set(state.items.map(i=>i.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function categorySelectOptions(selected,includeAll=false){const values=categories();if(selected&&!values.includes(selected))values.push(selected);values.sort((a,b)=>a.localeCompare(b));return(includeAll?'<option value="all">All categories</option>':'')+values.map(c=>`<option value="${esc(c)}" ${selected===c?'selected':''}>${esc(c)}</option>`).join('')}
function recurringOptions(){const map=new Map();state.items.forEach(i=>{const key=`${i.item}|||${i.category}`;if(!map.has(key))map.set(key,{key,item:i.item,category:i.category,count:0});map.get(key).count++});return[...map.values()].filter(x=>x.count>1).sort((a,b)=>a.item.localeCompare(b.item,'en-AU',{numeric:true,sensitivity:'base'}))}
function groceryCategory(){return String(state.settings.grocery_category||'Groceries').toLowerCase()}
function isSavingsItem(i){return i.type==='Expense'&&String(i.category||'').toLowerCase().includes('saving')}
function periodStats(p){
  const grocery=p.items.filter(i=>i.type==='Expense'&&String(i.category).toLowerCase()===groceryCategory()).reduce((s,i)=>s+i.amount,0);
  const savings=p.items.filter(isSavingsItem).reduce((s,i)=>s+i.amount,0);
  const outgoings=p.items.filter(i=>i.type==='Expense').reduce((s,i)=>s+i.amount,0);
  const remainingOutgoings=p.items.filter(i=>i.type==='Expense'&&!i.paid).reduce((s,i)=>s+i.amount,0);
  return{grocery,savings,outgoings,remainingOutgoings};
}

function authNeedsPassword(){return AUTH_LINK_TYPE==='invite'||AUTH_LINK_TYPE==='recovery'}
function showAuthMessage(kind,msg){const e=$('#authError'),s=$('#authSuccess');if(e)e.classList.remove('show');if(s)s.classList.remove('show');const target=kind==='error'?e:s;if(target){target.textContent=msg;target.classList.add('show')}}
function authShell(inner,title,sub){$('#app').innerHTML=`<main class="auth-page"><section class="auth-card"><div class="auth-brand">${brandmark()}<div><div class="auth-title">${esc(title)}</div><div class="auth-sub">${esc(sub)}</div></div></div><div id="authError" class="auth-error"></div><div id="authSuccess" class="auth-success"></div>${inner}</section></main>`;$('#modal').innerHTML=''}
function renderLogin(){state.authMode='login';authShell(`<form onsubmit="signIn(event)"><div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" required></div><div class="auth-actions"><button id="signInBtn" class="primary" type="submit">Sign in</button><button class="auth-link" type="button" onclick="renderForgotPassword()">Forgot password?</button></div></form><div class="auth-note">Access is limited to invited household members.</div>`,'CashForCoffee','Sign in to your household budget')}
window.signIn=async e=>{e.preventDefault();const btn=$('#signInBtn');btn.disabled=true;btn.textContent='Signing in…';const{data,error}=await sb.auth.signInWithPassword({email:$('#authEmail').value.trim(),password:$('#authPassword').value});if(error){showAuthMessage('error',error.message);btn.disabled=false;btn.textContent='Sign in';return}AUTH_LINK_TYPE='';history.replaceState({},document.title,location.pathname);state.session=data.session;await startApp()};
window.renderForgotPassword=()=>{authShell(`<form onsubmit="sendPasswordReset(event)"><div class="field"><label>Email</label><input id="resetEmail" type="email" autocomplete="email" required></div><div class="auth-actions"><button id="resetBtn" class="primary" type="submit">Send reset link</button><button class="auth-link" type="button" onclick="renderLogin()">Back to sign in</button></div></form>`,'Reset password','We will email you a secure link to choose a new password')};
window.sendPasswordReset=async e=>{e.preventDefault();const btn=$('#resetBtn');btn.disabled=true;btn.textContent='Sending…';const redirectTo=location.origin+location.pathname;const{error}=await sb.auth.resetPasswordForEmail($('#resetEmail').value.trim(),{redirectTo});if(error){showAuthMessage('error',error.message);btn.disabled=false;btn.textContent='Send reset link'}else{showAuthMessage('success','Reset email sent. Check your inbox.');btn.textContent='Email sent'}};
function renderSetPassword(mode='invite'){state.authMode='password';const heading=mode==='recovery'?'Choose a new password':'Finish setting up';const sub=mode==='recovery'?'Create a new password for CashForCoffee':'Your invitation worked. Create the password you will use to sign in.';authShell(`<form onsubmit="setAccountPassword(event)"><div class="field"><label>New password</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label>Confirm password</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></div><div class="auth-actions"><button id="setPasswordBtn" class="primary" type="submit">Save password</button></div></form><div class="auth-note">Use at least 8 characters. Your signed-in session will remain on this device.</div>`,heading,sub)}
window.setAccountPassword=async e=>{e.preventDefault();const password=$('#newPassword').value,confirm=$('#confirmPassword').value;if(password!==confirm){showAuthMessage('error','The passwords do not match.');return}const btn=$('#setPasswordBtn');btn.disabled=true;btn.textContent='Saving…';const{data,error}=await sb.auth.updateUser({password,data:{cashforcoffee_password_set:true}});if(error){showAuthMessage('error',error.message);btn.disabled=false;btn.textContent='Save password';return}state.session={...(state.session||{}),user:data.user};AUTH_LINK_TYPE='';history.replaceState({},document.title,location.pathname);await startApp()};
window.signOut=async()=>{if(!confirm('Sign out of CashForCoffee on this device?'))return;await sb.auth.signOut()};
function startRealtime(){if(realtimeChannel)return;realtimeChannel=sb.channel('cashforcoffee-live-auth').on('postgres_changes',{event:'*',schema:'public',table:'budget_items'},applyRealtime).on('postgres_changes',{event:'*',schema:'public',table:'budget_settings'},async()=>{const{data}=await sb.from('budget_settings').select('*').eq('id','global').single();if(data){state.settings={...data,starting_balance:Number(data.starting_balance)};render()}}).subscribe()}
async function stopRealtime(){if(realtimeChannel){await sb.removeChannel(realtimeChannel);realtimeChannel=null}}
async function startApp(){if(!state.session)return renderLogin();if(authNeedsPassword(state.session.user))return renderSetPassword(AUTH_LINK_TYPE==='recovery'?'recovery':'invite');startRealtime();if(!state.itemsLoaded)await loadAll();else render()}
async function initialiseAuth(){const{data:{session},error}=await sb.auth.getSession();if(error)console.error(error);state.session=session;if(session&&authNeedsPassword(session.user))renderSetPassword(AUTH_LINK_TYPE==='recovery'?'recovery':'invite');else if(session)await startApp();else renderLogin()}
async function loadAll(){
  const[{data:items,error:e1},{data:settings,error:e2}]=await Promise.all([
    sb.from('budget_items').select('*').order('date').order('created_at'),
    sb.from('budget_settings').select('*').eq('id','global').single()
  ]);
  if(e1||e2){fail(e1||e2,'Could not load CashForCoffee');return}
  state.items=(items||[]).map(i=>({...i,amount:Number(i.amount)}));
  state.settings={...settings,starting_balance:Number(settings.starting_balance)};
  state.itemsLoaded=true;
  render();
}
function summaryCards(p){const s=periodStats(p);return `<section class="summary">
  <div class="summary-card income"><div class="summary-label">${icon('arrow-down-circle')} Income</div><div class="summary-value mono">${money(p.income)}</div><div class="summary-note">This fortnight</div></div>
  <div class="summary-card expense"><div class="summary-label">${icon('arrow-up-circle')} Outgoings</div><div class="summary-value mono">${money(s.outgoings)}</div><div class="summary-note">Including savings</div></div>
  <div class="summary-card remaining"><div class="summary-label">${icon('wallet')} Remaining outgoings</div><div class="summary-value mono" data-metric="period-remaining">${money(s.remainingOutgoings)}</div><div class="summary-note">Still to leave the main account</div></div>
  <div class="summary-card expected"><div class="summary-label">${icon('piggy-bank')} Expected balance</div><div class="summary-value mono ${p.balance<0?'negative':''}">${money(p.balance)}</div><div class="summary-note">End of fortnight</div></div>
  <div class="summary-card savings"><div class="summary-label">${icon('coins')} Savings</div><div class="summary-value mono">${money(s.savings)}</div><div class="summary-note">Savings & sinking funds</div></div>
</section>`}
function categoryOptions(selected){return categorySelectOptions(selected,true)}
function periodVisibleItems(p){const q=state.search.trim().toLowerCase();return p.items.filter(i=>{const hit=!q||[i.item,i.category,i.notes,i.type,i.date].some(v=>String(v||'').toLowerCase().includes(q));const f=state.filter==='all'||(state.filter==='paid'&&i.paid)||(state.filter==='unpaid'&&!i.paid);const c=state.category==='all'||i.category===state.category;return hit&&f&&c}).sort(itemSort)}
function tableHTML(items,mode='period',periodIdx=null){
  const displayItems=mode==='all'?[...items]:[...items].sort(itemSort),showContext=mode==='period'&&periodIdx===currentIdx();
  return `<div class="table-wrap"><table class="budget-table"><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th><th>Paid</th><th></th></tr></thead><tbody>
  ${displayItems.length?displayItems.map((i,index)=>`<tr class="${mode==='all'&&isMainIncome(i)&&index>0?'pay-period-start':''}" data-id="${i.id}" data-search="${esc([i.item,i.category,i.notes,i.type,i.date].join(' ').toLowerCase())}" onclick="editItem('${i.id}')">
    <td data-label="Date"><span class="date-line">${fullDate(i.date)}${showContext&&dateContext(i.date)?`<span class="date-context">· ${dateContext(i.date)}</span>`:''}</span></td><td data-label="Item"><span class="mobile-item-line"><span class="item-main ${i.paid?'paid':''}">${esc(i.item)}</span><span class="pill mobile-category ${categoryClass(i.category)}">${esc(i.category)}</span></span>${i.notes?`<div style="font-size:10px;color:var(--muted);margin-top:3px">${esc(i.notes)}</div>`:''}</td>
    <td data-label="Category"><span class="pill ${categoryClass(i.category)}">${esc(i.category)}</span></td>
    <td data-label="Amount" class="amount ${i.type==='Income'?'income':'expense'} mono"><button class="amount-edit" title="Quick edit amount" onclick="event.stopPropagation();quickEditAmount('${i.id}')">${i.type==='Income'?'+':'-'}${money(i.amount)}</button></td>
    <td data-label="Paid"><button class="check ${i.paid?'paid':''}" onclick="event.stopPropagation();togglePaid('${i.id}',${i.paid})">${i.paid?'✓':''}</button></td>
    <td data-label="More"><button class="more" onclick="event.stopPropagation();editItem('${i.id}')">⋯</button></td></tr>`).join(''):`<tr><td colspan="6" style="padding:34px;text-align:center;color:var(--muted)">No matching items.</td></tr>`}
  </tbody></table></div><div class="table-foot"><span>${displayItems.length.toLocaleString()} item${displayItems.length===1?'':'s'}</span>${mode==='period'?`<button class="ghost" onclick="setView('all')">View everything →</button>`:''}</div>`
}
function forecastHTML(ps,p,limit=12){const shown=ps.filter(x=>x.idx>=currentIdx()).slice(0,limit),max=Math.max(1,...shown.map(x=>Math.abs(x.net)));return shown.map(x=>`<button class="forecast-row ${x.idx===p.idx?'selected':''}" onclick="selectPeriod(${x.idx});setView('dashboard')"><span class="forecast-date">${esc(periodLabel(x))}</span><span class="bar-zone"><span class="bar ${x.net<0?'negative':''}" style="width:${Math.max(2,Math.round(Math.abs(x.net)/max*100))}%"></span></span><span class="forecast-amount mono ${x.net<0?'negative':''}">${money(x.net)}</span><span>›</span></button>`).join('')}
function dashboardView(ps,p){const items=periodVisibleItems(p);return `<div class="dashboard-grid"><div class="left-col">${summaryCards(p)}<section class="panel budget-panel"><div class="panel-head"><div><div class="panel-title">Budget items</div><div class="panel-sub" data-period-count>${p.items.filter(i=>!i.paid).length} remaining of ${p.items.length} items this fortnight</div></div><div class="panel-spacer"></div><button class="primary panel-add" onclick="addItem()">${icon('plus')} Add item</button></div><div class="toolbar"><div class="search-wrap">${icon('search')}<input class="search" placeholder="Search items…" value="${esc(state.search)}" oninput="setPeriodSearch(this.value)"></div><select class="select category-filter" onchange="setPeriodCategory(this.value)">${categoryOptions(state.category)}</select><select class="select paid-filter" onchange="setPeriodFilter(this.value)"><option value="all">All</option><option value="unpaid" ${state.filter==='unpaid'?'selected':''}>Unpaid</option><option value="paid" ${state.filter==='paid'?'selected':''}>Paid</option></select></div>${tableHTML(items,'period',p.idx)}</section></div></div>`}
function allItems(){const q=state.allSearch.trim().toLowerCase();const currentStart=dateToDay(state.settings.anchor)+currentIdx()*14;return state.items.filter(i=>{const hit=!q||[i.item,i.category,i.notes,i.type,i.date].some(v=>String(v||'').toLowerCase().includes(q));const c=state.allCategory==='all'||i.category===state.allCategory;const p=state.allPaid==='all'||(state.allPaid==='paid'&&i.paid)||(state.allPaid==='unpaid'&&!i.paid);const dateOk=!state.hidePast||dateToDay(i.date)>=currentStart;return hit&&c&&p&&dateOk}).map(i=>i).sort(allItemSort)}
function allView(){const items=allItems(),income=state.items.filter(i=>i.type==='Income').reduce((s,i)=>s+i.amount,0),savings=state.items.filter(isSavingsItem).reduce((s,i)=>s+i.amount,0),outgoings=state.items.filter(i=>i.type!=='Income').reduce((s,i)=>s+i.amount,0),unpaid=state.items.filter(i=>i.type!=='Income'&&!i.paid).reduce((s,i)=>s+i.amount,0),expected=(Number(state.settings.starting_balance)||0)+income-outgoings;return `<div class="all-grid"><section class="all-summary"><div class="mini-card metric-income"><div class="label">${icon('arrow-down-circle')} Income</div><div class="value mono">${money(income)}</div></div><div class="mini-card metric-outgoings"><div class="label">${icon('arrow-up-circle')} Outgoings</div><div class="value mono">${money(outgoings)}</div></div><div class="mini-card metric-remaining"><div class="label">${icon('wallet')} Remaining outgoings</div><div class="value mono" data-metric="all-remaining">${money(unpaid)}</div></div><div class="mini-card metric-expected"><div class="label">${icon('piggy-bank')} Expected balance</div><div class="value mono ${expected<0?'negative':''}">${money(expected)}</div></div><div class="mini-card metric-savings"><div class="label">${icon('coins')} Savings</div><div class="value mono">${money(savings)}</div></div></section><section class="panel budget-panel"><div class="all-sticky-controls"><div class="panel-head"><div><div class="panel-title">Everything</div><div class="panel-sub">${items.length.toLocaleString()} visible of ${state.items.length.toLocaleString()} items</div></div><div class="panel-spacer"></div><label class="past-toggle"><input type="checkbox" ${state.hidePast?'checked':''} onchange="togglePastFortnights(this.checked)"><span>Hide past fortnights</span></label><button class="primary panel-add" onclick="addItem()">${icon('plus')} Add item</button></div><div class="toolbar"><div class="search-wrap">${icon('search')}<input class="search" placeholder="Search all items…" value="${esc(state.allSearch)}" oninput="setAllSearch(this.value)"></div><select class="select category-filter" onchange="setAllCategory(this.value)">${categoryOptions(state.allCategory)}</select><select class="select paid-filter" onchange="setAllPaid(this.value)"><option value="all">All</option><option value="unpaid" ${state.allPaid==='unpaid'?'selected':''}>Unpaid</option><option value="paid" ${state.allPaid==='paid'?'selected':''}>Paid</option></select></div></div>${tableHTML(items,'all')}</section></div>`}
function forecastView(ps,p){return `<div class="forecast-page"><section class="panel"><div class="panel-head"><div><div class="panel-title">Full fortnight forecast</div><div class="panel-sub">Expected balance for each pay fortnight. Tap a period to open it.</div></div></div>${forecastHTML(ps,p,Number(state.settings.forecast_periods)||26)}</section></div>`}

function cashflowView(){
  return `<div class="forecast-page"><section class="cashflow-card"><div class="cashflow-head"><div><div class="cashflow-title">Cumulative cash flow</div><div class="cashflow-sub">Running balance across future pay fortnights</div></div><div class="cashflow-legend"><span><i class="legend-dot pos"></i>Positive</span><span><i class="legend-dot neg"></i>Below zero</span></div></div><div class="cashflow-canvas-wrap"><canvas id="cashflowChart"></canvas></div><div class="zero-note">Each point carries the previous fortnight forward, so the line shows your projected running position.</div></section></div>`;
}
function renderCashflowChart(ps){
  if(cashflowChart){cashflowChart.destroy();cashflowChart=null}
  const canvas=document.getElementById('cashflowChart');
  if(!canvas||typeof Chart==='undefined')return;
  const shown=ps.filter(x=>x.idx>=currentIdx()).slice(0,Number(state.settings.forecast_periods)||26);
  const labels=shown.map(x=>fullDate(x.end));
  let running=Number(state.settings.starting_balance)||0;
  const values=shown.map(x=>{
    running+=Number(x.net)||0;
    return Number(running.toFixed(2));
  });
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,330);
  gradient.addColorStop(0,'rgba(36,106,138,.28)');
  gradient.addColorStop(1,'rgba(36,106,138,.02)');
  cashflowChart=new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Expected balance',
        data:values,
        borderWidth:3,
        pointRadius:3,
        pointHoverRadius:6,
        pointBackgroundColor:values.map(v=>v<0?'#BE2D2D':'#246A8A'),
        pointBorderColor:'#FFFFFF',
        pointBorderWidth:2,
        fill:true,
        backgroundColor:gradient,
        tension:.34,
        segment:{borderColor:c=>((c.p0.parsed.y<0||c.p1.parsed.y<0)?'#BE2D2D':'#246A8A')}
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          displayColors:false,
          backgroundColor:'#142019',
          titleFont:{family:'Inter',size:11},
          bodyFont:{family:'IBM Plex Mono',size:12,weight:'600'},
          padding:11,
          callbacks:{label:c=>' '+money(c.parsed.y)}
        }
      },
      scales:{
        x:{
          grid:{display:false},
          border:{display:false},
          ticks:{color:'#68756D',font:{family:'Inter',size:10},maxRotation:0,autoSkip:true,maxTicksLimit:9}
        },
        y:{
          grid:{
            color:c=>c.tick.value===0?'rgba(190,45,45,.45)':'rgba(104,117,109,.12)',
            lineWidth:c=>c.tick.value===0?2:1
          },
          border:{display:false},
          ticks:{
            color:'#68756D',
            font:{family:'IBM Plex Mono',size:10},
            callback:v=>'$'+Intl.NumberFormat('en-AU',{notation:'compact',maximumFractionDigits:1}).format(v)
          }
        }
      }
    }
  });
}

function breakdownData(items){
  const expenses=items.filter(i=>i.type!=='Income');
  const total=expenses.reduce((sum,i)=>sum+Number(i.amount),0);
  const categoryMap=new Map();

  expenses.forEach(i=>{
    const categoryName=String(i.category||'Other').trim()||'Other';
    const itemName=String(i.item||'Untitled item').trim()||'Untitled item';
    const categoryKey=categoryName.toLowerCase();
    const itemKey=itemName.toLowerCase();

    if(!categoryMap.has(categoryKey)){
      categoryMap.set(categoryKey,{
        name:categoryName,
        total:0,
        occurrences:0,
        itemMap:new Map()
      });
    }

    const category=categoryMap.get(categoryKey);
    category.total+=Number(i.amount);
    category.occurrences+=1;

    if(!category.itemMap.has(itemKey)){
      category.itemMap.set(itemKey,{
        name:itemName,
        total:0,
        occurrences:0
      });
    }

    const item=category.itemMap.get(itemKey);
    item.total+=Number(i.amount);
    item.occurrences+=1;
  });

  const groups=[...categoryMap.values()].map(category=>({
    name:category.name,
    total:category.total,
    occurrences:category.occurrences,
    items:[...category.itemMap.values()].sort((a,b)=>b.total-a.total)
  })).sort((a,b)=>b.total-a.total);

  return{total,groups};
}
function breakdownView(){
  const items=[...state.items];
  const d=breakdownData(items);
  const incomeItems=items.filter(i=>i.type==='Income');
  const income=incomeItems.reduce((s,i)=>s+Number(i.amount),0);
  const savingsItems=items.filter(isSavingsItem);
  const savings=savingsItems.reduce((s,i)=>s+Number(i.amount),0);
  const expenses=items.filter(i=>i.type!=='Income'&&!isSavingsItem(i)).reduce((s,i)=>s+Number(i.amount),0);
  const outgoings=expenses+savings;
  const net=income-outgoings;
  const top=d.groups[0];
  const savingsGroup=d.groups.find(g=>String(g.name).toLowerCase().includes('saving'));
  const incomePct=income?Math.round(outgoings/income*100):0;

  const datedItems=items.filter(i=>i.date).sort((a,b)=>dateToDay(a.date)-dateToDay(b.date));
  const rangeStart=datedItems[0]?.date||'';
  const rangeEnd=datedItems[datedItems.length-1]?.date||'';
  const rangeLabel=rangeStart&&rangeEnd?`${new Date(rangeStart+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})} – ${new Date(rangeEnd+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`:'No dated budget items';

  const incomeByYear=new Map();
  const incomeByMonth=new Map();
  incomeItems.forEach(i=>{
    const date=new Date(i.date+'T00:00:00');
    if(Number.isNaN(date.getTime()))return;
    const year=String(date.getFullYear());
    const monthKey=`${year}-${String(date.getMonth()+1).padStart(2,'0')}`;
    incomeByYear.set(year,(incomeByYear.get(year)||0)+Number(i.amount));
    incomeByMonth.set(monthKey,(incomeByMonth.get(monthKey)||0)+Number(i.amount));
  });
  const yearlyIncome=[...incomeByYear.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const monthlyIncome=[...incomeByMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const monthLabel=key=>{const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-AU',{month:'short',year:'numeric'})};

  return `<div class="breakdown-page">
    <section class="insight-grid">
      <div class="insight-card"><div class="insight-icon">◉</div><div class="insight-text">${top?`<strong>${esc(top.name)}</strong> is the largest category at <strong>${Math.round(top.total/d.total*100)}%</strong> of all outgoings.`:'No expense data is available.'}</div></div>
      <div class="insight-card"><div class="insight-icon">◆</div><div class="insight-text">${savingsGroup?`Savings and sinking funds total <strong>${money(savingsGroup.total)}</strong>, or <strong>${Math.round(savingsGroup.total/d.total*100)}%</strong> of all outgoings.`:'No savings category is available.'}</div></div>
      <div class="insight-card"><div class="insight-icon">↕</div><div class="insight-text">All outgoings equal <strong>${incomePct}%</strong> of total income across the full budget.</div></div>
    </section>

    <section class="breakdown-summary">
      <div class="mini-card"><div class="label">Total income</div><div class="value mono" style="color:var(--green)">${money(income)}</div></div>
      <div class="mini-card"><div class="label">Total expenses</div><div class="value mono" style="color:var(--red)">${money(expenses)}</div></div>
      <div class="mini-card"><div class="label">Total savings</div><div class="value mono" style="color:var(--amber)">${money(savings)}</div></div>
      <div class="mini-card"><div class="label">Net position</div><div class="value mono ${net<0?'negative':''}">${money(net)}</div></div>
    </section>

    <section class="panel income-summary-panel">
      <div class="panel-head"><div><div class="panel-title">Income over time</div><div class="panel-sub">Budget period: ${esc(rangeLabel)}. Income totals are based on the dated Income items in your budget.</div></div></div>
      <div class="income-time-grid">
        <div class="income-time-section">
          <div class="income-time-title">By year</div>
          <div class="income-time-list">${yearlyIncome.length?yearlyIncome.map(([year,total])=>{
            const yearStart=`${year}-01-01`,yearEnd=`${year}-12-31`;
            const coveredStart=rangeStart&&rangeStart>yearStart?rangeStart:yearStart;
            const coveredEnd=rangeEnd&&rangeEnd<yearEnd?rangeEnd:yearEnd;
            const partial=coveredStart!==yearStart||coveredEnd!==yearEnd;
            const coverage=partial?`<small>${shortDate(coveredStart)} – ${shortDate(coveredEnd)}</small>`:'<small>Full year</small>';
            return `<div class="income-time-row"><span><strong>${esc(year)}</strong>${coverage}</span><span class="mono">${money(total)}</span></div>`;
          }).join(''):'<div class="income-time-empty">No income items</div>'}</div>
        </div>
        <div class="income-time-section">
          <div class="income-time-title">By month</div>
          <div class="income-month-grid">${monthlyIncome.length?monthlyIncome.map(([month,total])=>`<div class="income-month-card"><span>${esc(monthLabel(month))}</span><strong class="mono">${money(total)}</strong></div>`).join(''):'<div class="income-time-empty">No income items</div>'}</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><div class="panel-title">Where the money goes</div><div class="panel-sub">Each recurring item is combined into one total across the full budget. Tap a category to see its item breakdown.</div></div></div>
      <div class="breakdown-list">${d.groups.length?d.groups.map(g=>{
        const categoryPct=d.total?g.total/d.total*100:0;
        return `<details class="breakdown-row">
          <summary>
            <span class="breakdown-name">${esc(g.name)}</span>
            <span class="breakdown-bar-track"><span class="breakdown-bar" style="width:${Math.max(2,categoryPct)}%"></span></span>
            <span class="breakdown-value"><span class="breakdown-amount mono">${money(g.total)}</span><span class="breakdown-pct">${categoryPct.toFixed(1)}%</span></span>
          </summary>
          <div class="breakdown-items">
            ${g.items.map(i=>{
              const itemPct=d.total?i.total/d.total*100:0;
              const withinCategoryPct=g.total?i.total/g.total*100:0;
              return `<div class="breakdown-item">
                <div class="breakdown-item-main">
                  <span class="breakdown-item-name">${esc(i.name)}</span>
                  <span class="breakdown-item-meta">${i.occurrences.toLocaleString()} occurrence${i.occurrences===1?'':'s'} · ${withinCategoryPct.toFixed(1)}% of ${esc(g.name)}</span>
                  <span class="breakdown-item-bar-track"><span class="breakdown-item-bar" style="width:${Math.max(2,withinCategoryPct)}%"></span></span>
                </div>
                <span class="breakdown-item-amount mono">${money(i.total)}</span>
                <span class="breakdown-item-pct">${itemPct.toFixed(1)}%</span>
              </div>`;
            }).join('')}
          </div>
        </details>`;
      }).join(''):'<div style="padding:28px;text-align:center;color:var(--muted)">No expense items are available.</div>'}</div>
    </section>
  </div>`;
}

function syncMobileLayoutVars(){
  const topbar=document.querySelector('.topbar');
  if(!topbar)return;
  document.documentElement.style.setProperty('--mobile-topbar-height',`${Math.ceil(topbar.getBoundingClientRect().height)}px`);
}
window.addEventListener('resize',()=>requestAnimationFrame(syncMobileLayoutVars),{passive:true});

function pageMeta(){if(state.view==='all')return['All items','Search and manage the full budget'];if(state.view==='forecast')return['Forecast','Future balance by pay fortnight'];if(state.view==='cashflow')return['Cash flow','Cumulative running balance'];if(state.view==='breakdown')return['Breakdown','Where your full budget goes'];return['CashForCoffee',state.settings?.budget_name||'Our household budget']}
function render(){if(!state.settings)return;document.body.classList.toggle('dashboard-lock',state.view==='dashboard');document.body.classList.toggle('all-lock',state.view==='all');const ps=buildPeriods(),p=selectedPeriod(ps);if(state.selectedPeriod===null)state.selectedPeriod=p.idx;const[title,sub]=pageMeta();$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">${brandmark()}<div><div class="brandname">CashForCoffee</div><div class="brandsub">Our household budget</div></div></div><nav class="nav-group"><button class="nav-btn ${state.view==='dashboard'?'active':''}" onclick="setView('dashboard')">${icon('layout-dashboard','nav-icon')}Dashboard</button><button class="nav-btn ${state.view==='all'?'active':''}" onclick="setView('all')">${icon('list','nav-icon')}All items</button><button class="nav-btn ${state.view==='forecast'?'active':''}" onclick="setView('forecast')">${icon('calendar-range','nav-icon')}Forecast</button><button class="nav-btn ${state.view==='breakdown'?'active':''}" onclick="setView('breakdown')">${icon('pie-chart','nav-icon')}Breakdown</button><button class="nav-btn ${state.view==='cashflow'?'active':''}" onclick="setView('cashflow')">${icon('chart-spline','nav-icon')}Cash flow</button><button class="nav-btn" onclick="openData()">${icon('settings','nav-icon')}Manage</button></nav><div class="side-label">Quick actions</div><button class="quick-btn" onclick="addItem()">${icon('plus')} Add item</button><button class="quick-btn" onclick="openData('bulk')">${icon('refresh-cw')} Bulk update</button><button class="quick-btn" onclick="openData('import')">${icon('upload')} Import / Fresh start</button><button class="quick-btn" onclick="openData('export')">${icon('download')} Export / Backup</button><button class="quick-btn" onclick="markPeriodPaid()">${icon('circle-check')} Mark period paid</button><div class="side-spacer"></div></aside><main class="main"><header class="topbar"><div class="mobile-brand">${brandmark()}<div><div class="brandname">CashForCoffee</div><div class="brandsub">${esc(sub)}</div></div></div><div class="page-heading"><div class="page-title">${esc(title)}</div><div class="page-sub">${esc(sub)}</div></div><div class="top-spacer"></div><button class="period-picker" onclick="setView('forecast')"><span class="icon">${icon('calendar-days')}</span><span><span class="label">${p.idx===currentIdx()?'Current':'Selected'} fortnight</span><span class="value">${esc(periodLabel(p))}</span></span>${icon('chevron-down','period-chevron')}</button><button class="top-manage" aria-label="Manage" title="Manage" onclick="openData()">${icon('settings-2')}</button><div class="sync-state"></div></header><div class="content">${state.view==='dashboard'?dashboardView(ps,p):state.view==='all'?allView():state.view==='forecast'?forecastView(ps,p):state.view==='breakdown'?breakdownView():cashflowView()}</div></main></div><button class="fab" aria-label="Add item" onclick="addItem()">${icon('plus')}</button><nav class="mobile-nav"><button class="${state.view==='dashboard'?'active':''}" onclick="setView('dashboard')">${icon('layout-dashboard')}<span>Dashboard</span></button><button class="${state.view==='all'?'active':''}" onclick="setView('all')">${icon('list')}<span>All items</span></button><button class="${state.view==='forecast'?'active':''}" onclick="setView('forecast')">${icon('calendar-range')}<span>Forecast</span></button><button class="${state.view==='cashflow'?'active':''}" onclick="setView('cashflow')">${icon('chart-spline')}<span>Cash flow</span></button><button class="${state.view==='breakdown'?'active':''}" onclick="setView('breakdown')">${icon('pie-chart')}<span>Breakdown</span></button></nav>`;renderTopSync();renderModal();if(window.lucide)lucide.createIcons({attrs:{'stroke-width':1.8}});requestAnimationFrame(syncMobileLayoutVars);if(state.view==='cashflow')requestAnimationFrame(()=>renderCashflowChart(ps))}
window.setView=v=>{if(v!=='cashflow'&&cashflowChart){cashflowChart.destroy();cashflowChart=null}state.view=v;render()};window.selectPeriod=i=>{state.selectedPeriod=i;render()};
function filterVisibleTable(v){const q=String(v||'').trim().toLowerCase();let shown=0;document.querySelectorAll('.budget-table tbody tr[data-search]').forEach(r=>{const visible=!q||r.dataset.search.includes(q);r.classList.toggle('search-hidden',!visible);if(visible)shown++});const foot=document.querySelector('.table-foot span');if(foot)foot.textContent=`${shown.toLocaleString()} item${shown===1?'':'s'}`}
window.setPeriodSearch=v=>{state.search=v;filterVisibleTable(v)};window.setPeriodFilter=v=>{state.filter=v;render()};window.setPeriodCategory=v=>{state.category=v;render()};window.setPeriodType=v=>{state.type=v;render()};
window.togglePastFortnights=v=>{state.hidePast=Boolean(v);localStorage.setItem('cfcHidePast',String(state.hidePast));render()};
window.setAllSearch=v=>{state.allSearch=v;filterVisibleTable(v)};window.setAllCategory=v=>{state.allCategory=v;render()};window.setAllType=v=>{state.allType=v;render()};window.setAllPaid=v=>{state.allPaid=v;render()};
function captureScrollState(){const content=document.querySelector('.content'),table=document.querySelector('.table-wrap');return{content:content?content.scrollTop:0,table:table?table.scrollTop:0,window:window.scrollY||0}}
function restoreScrollState(pos){requestAnimationFrame(()=>requestAnimationFrame(()=>{const content=document.querySelector('.content'),table=document.querySelector('.table-wrap');if(content)content.scrollTop=pos?.content||0;if(table)table.scrollTop=pos?.table||0;if(!content&&pos?.window)window.scrollTo(0,pos.window)}))}
function tableScrollTop(){const el=document.querySelector('.table-wrap');return el?el.scrollTop:0}function restoreTableScroll(y){requestAnimationFrame(()=>{const el=document.querySelector('.table-wrap');if(el)el.scrollTop=y})}
window.quickEditAmount=async id=>{const item=state.items.find(i=>i.id===id);if(!item)return;const raw=prompt(`New amount for “${item.item}”`,Number(item.amount).toFixed(2));if(raw===null)return;const amount=Math.abs(Number(String(raw).replace(/[$,\s]/g,'')));if(!Number.isFinite(amount)){alert('Enter a valid amount.');return}const old=item.amount;item.amount=amount;state.sync='saving';render();const{error}=await sb.from('budget_items').update({amount}).eq('id',id);if(error){item.amount=old;fail(error,'Could not update amount');render()}else{state.sync='';renderTopSync();toast('Amount updated')}}
function refreshPaidUI(item){
  const row=document.querySelector(`.budget-table tr[data-id="${item.id}"]`);
  if(row){
    const btn=row.querySelector('.check');
    const name=row.querySelector('.item-main');
    if(btn){btn.classList.toggle('paid',item.paid);btn.textContent=item.paid?'✓':'';btn.setAttribute('onclick',`event.stopPropagation();togglePaid('${item.id}',${item.paid})`)}
    if(name)name.classList.toggle('paid',item.paid);
  }
  const period=selectedPeriod(buildPeriods());
  const periodRemaining=period.items.filter(i=>i.type==='Expense'&&!i.paid).reduce((sum,i)=>sum+i.amount,0);
  const periodMetric=document.querySelector('[data-metric="period-remaining"]');
  if(periodMetric)periodMetric.textContent=money(periodRemaining);
  const periodCount=document.querySelector('[data-period-count]');
  if(periodCount)periodCount.textContent=`${period.items.filter(i=>!i.paid).length} remaining of ${period.items.length} items this fortnight`;
  const allRemaining=state.items.filter(i=>i.type!=='Income'&&!i.paid).reduce((sum,i)=>sum+i.amount,0);
  const allMetric=document.querySelector('[data-metric="all-remaining"]');
  if(allMetric)allMetric.textContent=money(allRemaining);
}
window.togglePaid=async(id,paid)=>{
  const item=state.items.find(i=>i.id===id);
  if(!item||state.pending.has(id))return;
  const next=!paid;
  const requiresFilterRender=(state.view==='dashboard'&&state.filter!=='all')||(state.view==='all'&&state.allPaid!=='all');
  const scrollPos=requiresFilterRender?captureScrollState():null;
  state.pending.add(id);
  item.paid=next;
  state.sync='saving';
  if(requiresFilterRender){render();restoreScrollState(scrollPos)}else{refreshPaidUI(item);renderTopSync()}
  const{error}=await sb.from('budget_items').update({paid:next}).eq('id',id);
  state.pending.delete(id);
  if(error){
    item.paid=paid;
    state.sync='error';
    if(requiresFilterRender){const rollbackPos=captureScrollState();render();restoreScrollState(rollbackPos)}else{refreshPaidUI(item);renderTopSync()}
    fail(error,'Could not update item');
  }else{
    state.sync='';
    renderTopSync();
  }
};
window.markPeriodPaid=async()=>{const p=selectedPeriod(buildPeriods()),targets=p.items.filter(i=>i.type==='Expense'&&!i.paid);if(!targets.length){toast('Nothing left to mark paid');return}targets.forEach(i=>i.paid=true);state.sync='saving';render();const ids=targets.map(i=>i.id);const{error}=await sb.from('budget_items').update({paid:true}).in('id',ids);if(error){targets.forEach(i=>i.paid=false);fail(error,'Could not mark period paid');render()}else{state.sync='';renderTopSync();toast(`${targets.length} items marked paid`)}};
window.addItem=()=>{state.editing=null;state.modal='item';renderModal()};window.editItem=id=>{state.editing=state.items.find(i=>i.id===id);state.modal='item';renderModal()};window.openData=t=>{state.modal='data';state.tab=t||'settings';renderModal()};window.closeModal=()=>{state.modal=null;state.editing=null;state.importParsed=null;renderModal()};
function renderModal(){const root=$('#modal');if(!root)return;if(!state.modal){root.innerHTML='';return}root.innerHTML=state.modal==='item'?itemSheet():dataSheet()}
function itemSheet(){const p=selectedPeriod(buildPeriods()),i=state.editing||{date:p.start,item:'',amount:'',type:'Expense',category:categories()[0]||'Other',paid:false,notes:''};return `<div class="backdrop" onclick="closeModal()"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">${state.editing?'Edit item':'Add item'}</div><button class="close" onclick="closeModal()">✕</button></div><form onsubmit="saveItem(event)"><div class="field"><label>Title</label><input id="fItem" required value="${esc(i.item)}"></div><div class="grid2"><div class="field"><label>Date</label><input id="fDate" type="date" required value="${i.date}"></div><div class="field"><label>Amount ($)</label><input id="fAmount" type="number" step="0.01" min="0" required value="${i.amount}"></div></div><div class="field"><label>Category</label><select id="fCategory" required>${categorySelectOptions(i.category,false)}</select><div class="help" style="margin-top:6px">Choosing Income records the item as income. Every other category is treated as an outgoing.</div></div><div class="field"><label>Notes</label><textarea id="fNotes" rows="3">${esc(i.notes)}</textarea></div><label style="display:flex;gap:8px;align-items:center;font-size:12px"><input id="fPaid" type="checkbox" ${i.paid?'checked':''}> Mark as paid</label><div class="actions">${state.editing?'<button type="button" class="danger" onclick="deleteItem()">Delete</button>':''}<button class="primary" type="submit">Save item</button></div></form></div></div>`}
window.saveItem=async e=>{e.preventDefault();const category=$('#fCategory').value;const row={date:$('#fDate').value,item:$('#fItem').value.trim(),amount:Math.abs(Number($('#fAmount').value)),type:inferredType(category),category,paid:$('#fPaid').checked,notes:$('#fNotes').value.trim()};if(!row.item||!row.date||!Number.isFinite(row.amount))return;state.sync='saving';const{data,error}=state.editing?await sb.from('budget_items').update(row).eq('id',state.editing.id).select().single():await sb.from('budget_items').insert(row).select().single();if(error){fail(error,'Could not save item');return}if(state.editing){const idx=state.items.findIndex(i=>i.id===state.editing.id);if(idx>=0)state.items[idx]={...state.items[idx],...data,amount:Number(data.amount)}}else state.items.push({...data,amount:Number(data.amount)});state.sync='';closeModal();render();toast('Item saved')};
window.deleteItem=async()=>{if(!confirm(`Delete “${state.editing.item}”?`))return;const id=state.editing.id;const backup=state.items.find(i=>i.id===id);state.items=state.items.filter(i=>i.id!==id);closeModal();render();const{error}=await sb.from('budget_items').delete().eq('id',id);if(error){state.items.push(backup);render();fail(error,'Could not delete item')}else toast('Item deleted')};
function dataSheet(){return `<div class="backdrop" onclick="closeModal()"><div class="sheet" onclick="event.stopPropagation()"><div class="sheet-head"><div class="sheet-title">Manage</div><button class="close" onclick="closeModal()">✕</button></div><div class="tabs"><button class="tab ${state.tab==='settings'?'active':''}" onclick="switchTab('settings')">Configuration</button><button class="tab ${state.tab==='bulk'?'active':''}" onclick="switchTab('bulk')">Bulk update</button><button class="tab ${state.tab==='import'?'active':''}" onclick="switchTab('import')">Fresh start</button><button class="tab ${state.tab==='export'?'active':''}" onclick="switchTab('export')">Backup</button></div>${state.tab==='settings'?settingsTab():state.tab==='bulk'?bulkTab():state.tab==='import'?importTab():exportTab()}<div class="account-strip"><div class="account-email">Signed in as ${esc(state.session?.user?.email||'')}</div><button class="secondary" type="button" onclick="signOut()">Sign out</button></div></div></div>`}
window.switchTab=t=>{state.tab=t;state.importParsed=null;renderModal()};

function bulkTab(){const opts=recurringOptions();return `<p class="help">Update one recurring budget item across future entries, such as a rent increase or a new grocery amount. Matching uses the exact item name and category.</p>${opts.length?`<div class="field"><label>Recurring item</label><select id="bulkKey" onchange="previewBulk()"><option value="">Choose an item…</option>${opts.map(o=>`<option value="${esc(o.key)}">${esc(o.item)} · ${esc(o.category)} (${o.count})</option>`).join('')}</select></div><div class="grid2"><div class="field"><label>New amount ($)</label><input id="bulkAmount" type="number" step="0.01" min="0" oninput="previewBulk()"></div><div class="field"><label>Effective from</label><input id="bulkDate" type="date" value="${dayToISO(todayDay())}" onchange="previewBulk()"></div></div><div class="field"><label>Update scope</label><select id="bulkScope" onchange="previewBulk()"><option value="future">This and future matching items</option><option value="one">First matching item only</option><option value="all">All matching items, including past</option></select></div><div id="bulkPreview" class="preview">Choose an item and enter its new amount.</div><button id="bulkBtn" class="primary" style="width:100%" disabled onclick="applyBulkUpdate()">Update matching items</button>`:'<div class="preview">No recurring items were found. An item needs to appear more than once before it can be bulk updated.</div>'}`}
function bulkTargets(){const key=$('#bulkKey')?.value||'',rawAmount=$('#bulkAmount')?.value??'',amount=rawAmount===''?NaN:Math.abs(Number(rawAmount)),date=$('#bulkDate')?.value,scope=$('#bulkScope')?.value||'future';if(!key||!Number.isFinite(amount)||!date)return{targets:[],amount,scope};const[item,category]=key.split('|||');let targets=state.items.filter(i=>i.item===item&&i.category===category).sort(itemSort);if(scope==='future')targets=targets.filter(i=>i.date>=date);if(scope==='one')targets=targets.filter(i=>i.date>=date).slice(0,1);return{targets,amount,scope,item,category}}
window.previewBulk=()=>{const box=$('#bulkPreview'),btn=$('#bulkBtn');if(!box||!btn)return;const b=bulkTargets();btn.disabled=!b.targets.length||!Number.isFinite(b.amount);if(!b.targets.length){box.innerHTML='No matching items from that date.';return}box.innerHTML=`<strong>${b.targets.length} item${b.targets.length===1?'':'s'} will change to ${money(b.amount)}</strong><div class="bulk-preview-list" style="margin-top:10px">${b.targets.slice(0,30).map(i=>`<div class="bulk-preview-row"><span>${fullDate(i.date)} · ${esc(i.item)}</span><span class="mono">${money(i.amount)} → ${money(b.amount)}</span></div>`).join('')}</div>${b.targets.length>30?`<div class="help" style="margin-top:8px">Plus ${b.targets.length-30} more.</div>`:''}`};
window.applyBulkUpdate=async()=>{const b=bulkTargets();if(!b.targets.length||!Number.isFinite(b.amount))return;if(b.scope==='all'&&!confirm('This will also change matching historical items. Continue?'))return;const ids=b.targets.map(i=>i.id),backup=b.targets.map(i=>({id:i.id,amount:i.amount}));b.targets.forEach(i=>i.amount=b.amount);state.sync='saving';render();const{error}=await sb.from('budget_items').update({amount:b.amount}).in('id',ids);if(error){backup.forEach(x=>{const i=state.items.find(y=>y.id===x.id);if(i)i.amount=x.amount});fail(error,'Could not complete the bulk update');render()}else{state.sync='';state.modal=null;render();toast(`${ids.length} item${ids.length===1?'':'s'} updated`)}}

function settingsTab(){const s=state.settings;return `<form onsubmit="saveSettingsForm(event)"><div class="field"><label>Budget name</label><input id="sName" value="${esc(s.budget_name)}"></div><div class="grid2"><div class="field"><label>Fortnight anchor date</label><input id="sAnchor" type="date" value="${s.anchor}" required></div><div class="field"><label>Opening balance</label><input id="sBalance" type="number" step="0.01" value="${s.starting_balance}" required></div></div><div class="grid2"><div class="field"><label>Grocery category</label><input id="sGrocery" value="${esc(s.grocery_category)}" required></div><div class="field"><label>Forecast periods</label><input id="sPeriods" type="number" min="4" max="130" value="${s.forecast_periods}" required></div></div><p class="help">The anchor date must be the first day of one genuine pay fortnight. Periods are now calculated using calendar dates in UTC, avoiding daylight-saving drift and duplicated pay-period boundaries.</p><button class="primary" style="width:100%">Save settings</button></form>`}
window.saveSettingsForm=async e=>{e.preventDefault();const row={id:'global',budget_name:$('#sName').value.trim()||'CashForCoffee',anchor:$('#sAnchor').value,starting_balance:Number($('#sBalance').value)||0,grocery_category:$('#sGrocery').value.trim()||'Groceries',forecast_periods:Number($('#sPeriods').value)||26};const{data,error}=await sb.from('budget_settings').upsert(row).select().single();if(error){fail(error,'Could not save configuration');return}state.settings={...data,starting_balance:Number(data.starting_balance)};state.selectedPeriod=null;closeModal();render();toast('Configuration saved')};
function importTab(){return `<p class="help">Paste CSV with columns Date, Item, Amount, Type and Category. This replaces all current budget items after validation.</p><div class="field"><label>Paste CSV</label><textarea id="csv" rows="7" placeholder="Date,Item,Amount,Type,Category"></textarea></div><button class="secondary" style="width:100%" onclick="previewImport()">Validate and preview</button>${state.importParsed?importPreview():''}`}
window.previewImport=()=>{const txt=$('#csv').value.trim(),result=Papa.parse(txt,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim().toLowerCase()});if(result.errors.length){alert(result.errors[0].message);return}const req=['date','item','amount','type'],missing=req.filter(k=>!result.meta.fields.includes(k));if(missing.length){alert('Missing columns: '+missing.join(', '));return}const rows=[],bad=[];result.data.forEach((r,n)=>{const d=parseDate(r.date),a=Number(String(r.amount).replace(/[$,\s]/g,''));if(!d||!r.item||!Number.isFinite(a)){bad.push(n+2);return}rows.push({date:d,item:String(r.item).trim(),amount:Math.abs(a),type:String(r.type).trim().toLowerCase()==='income'?'Income':'Expense',category:String(r.category||'Other').trim()||'Other',paid:false,notes:''})});state.importParsed={rows,bad,min:rows.map(r=>r.date).sort()[0],max:rows.map(r=>r.date).sort().at(-1)};renderModal()};
function parseDate(v){const s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])));return d.toISOString().slice(0,10)}const d=new Date(s);return isNaN(d)?null:d.toISOString().slice(0,10)}
function importPreview(){const p=state.importParsed;return `<div class="preview"><strong>${p.rows.length.toLocaleString()} valid items ready</strong><br>${p.min?`${fullDate(p.min)} to ${fullDate(p.max)}`:''}${p.bad.length?`<br><span class="negative">Skipped rows: ${p.bad.join(', ')}</span>`:''}</div><div class="warning"><strong>Fresh start:</strong> this permanently replaces all existing budget items, edits and paid statuses.</div><div class="field"><label>Type REPLACE MY BUDGET to confirm</label><input id="confirmReplace" oninput="checkReplace(this.value)"></div><button id="replaceBtn" class="danger" style="width:100%" disabled onclick="replaceAll()">Delete and replace all items</button>`}
window.checkReplace=v=>{$('#replaceBtn').disabled=v!=='REPLACE MY BUDGET'};window.replaceAll=async()=>{if(!state.importParsed||state.busy)return;state.busy=true;$('#replaceBtn').disabled=true;$('#replaceBtn').textContent='Replacing…';const{data,error}=await sb.rpc('replace_budget_items',{new_items:state.importParsed.rows});state.busy=false;if(error){fail(error,'Fresh start failed');renderModal()}else{state.modal=null;state.importParsed=null;state.search='';state.filter='all';state.category='all';await loadAll();const ps=buildPeriods(),current=ps.find(p=>p.idx===currentIdx());state.selectedPeriod=current?.items.length?current.idx:(ps.find(p=>p.idx>=currentIdx()&&p.items.length)?.idx??currentIdx());render();toast(`${data} items imported`)}};
function exportTab(){return `<p class="help">Download a full CSV backup of the live Supabase budget, including paid status and notes.</p><button class="primary" style="width:100%" onclick="exportCSV()">Download budget CSV</button><div style="height:10px"></div><button class="secondary" style="width:100%" onclick="exportSettings()">Download settings JSON</button>`}
window.exportCSV=()=>{const rows=[...state.items].sort(itemSort).map(i=>({Date:i.date,Item:i.item,Amount:i.amount,Type:i.type,Category:i.category,Paid:i.paid?'Yes':'No',Notes:i.notes||''}));download(Papa.unparse(rows),'CashForCoffee-budget.csv','text/csv')};window.exportSettings=()=>download(JSON.stringify(state.settings,null,2),'CashForCoffee-settings.json','application/json');function download(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function sameBudgetItem(a,b){
  if(!a||!b)return false;
  return String(a.date||'')===String(b.date||'')&&
    String(a.item||'')===String(b.item||'')&&
    Number(a.amount)===Number(b.amount)&&
    String(a.type||'')===String(b.type||'')&&
    String(a.category||'')===String(b.category||'')&&
    Boolean(a.paid)===Boolean(b.paid)&&
    String(a.notes||'')===String(b.notes||'');
}
function applyRealtime(payload){
  const row=payload.new||payload.old;
  if(!row)return;
  let changed=false;
  const scrollPos=captureScrollState();
  if(payload.eventType==='INSERT'){
    if(!state.items.some(i=>i.id===row.id)){
      state.items.push({...row,amount:Number(row.amount)});
      changed=true;
    }
  }else if(payload.eventType==='UPDATE'){
    const idx=state.items.findIndex(i=>i.id===row.id);
    if(idx>=0&&!state.pending.has(row.id)){
      const incoming={...state.items[idx],...row,amount:Number(row.amount)};
      if(!sameBudgetItem(state.items[idx],incoming)){
        state.items[idx]=incoming;
        changed=true;
      }
    }else if(idx<0){
      state.items.push({...row,amount:Number(row.amount)});
      changed=true;
    }
  }else if(payload.eventType==='DELETE'){
    const before=state.items.length;
    state.items=state.items.filter(i=>i.id!==row.id);
    changed=state.items.length!==before;
  }
  if(changed){render();restoreScrollState(scrollPos)}
}
sb.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{state.session=session;if(event==='SIGNED_OUT'){state.items=[];state.settings=null;state.itemsLoaded=false;await stopRealtime();renderLogin();return}if(event==='PASSWORD_RECOVERY'){renderSetPassword('recovery');return}if(event==='SIGNED_IN'&&session){if(state.authMode==='login'){AUTH_LINK_TYPE='';history.replaceState({},document.title,location.pathname)}await startApp()}if(event==='USER_UPDATED'&&session&&!authNeedsPassword(session.user)){await startApp()}},0)});
initialiseAuth();
