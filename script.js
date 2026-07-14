(function(){

  // ---------------------------------------------------------
  // 0. TOGGLE DE TEMA CLARO / OSCURO
  // ---------------------------------------------------------
  const themeToggle = document.getElementById('themeToggle');
  if(themeToggle){
    themeToggle.addEventListener('click', ()=>{
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      try{ localStorage.setItem('pizarra-theme', next); }catch(e){ /* almacenamiento no disponible */ }

      // Volver a dibujar las gráficas si ya hay una solución en pantalla,
      // para que las líneas de tiza usen los colores del nuevo tema.
      const plotPanel = document.getElementById('plotPanel');
      const solveBtn = document.getElementById('solveBtn');
      if(plotPanel && solveBtn && plotPanel.style.display === 'block'){
        setTimeout(()=> solveBtn.click(), 50);
      }
    });
  }

  // ---------------------------------------------------------
  // 1. ESTADO Y CONTROLES DE ORDEN
  // ---------------------------------------------------------
  let order = 1;
  const btnOrder1 = document.getElementById('btnOrder1');
  const btnOrder2 = document.getElementById('btnOrder2');
  const fieldsOrder1 = document.getElementById('fieldsOrder1');
  const fieldsOrder2 = document.getElementById('fieldsOrder2');

  btnOrder1.addEventListener('click', () => setOrder(1));
  btnOrder2.addEventListener('click', () => setOrder(2));

  function setOrder(n){
    order = n;
    btnOrder1.classList.toggle('active', n===1);
    btnOrder2.classList.toggle('active', n===2);
    fieldsOrder1.style.display = n===1 ? 'block' : 'none';
    fieldsOrder2.style.display = n===2 ? 'block' : 'none';
  }

  // ---------------------------------------------------------
  // 2. PRESETS
  // ---------------------------------------------------------
  const presets = {
    exp:        {order:1, A:'1',   B:'0', y0:'1', exact:'exp(x)'},
    expx2:      {order:1, A:'0,2', B:'0', y0:'1', exact:'exp(x*x)'},
    sin:        {order:2, P0:'1', P1:'0',  P2:'1',  G:'0', y0:'0', y1:'1', exact:'sin(x)'},
    cosh:       {order:2, P0:'1', P1:'0',  P2:'-1', G:'0', y0:'1', y1:'0', exact:'cosh(x)'},
    airy:       {order:2, P0:'1', P1:'0',  P2:'0,-1', G:'0', y0:'1', y1:'0', exact:''},
    legendre:   {order:2, P0:'1,0,-1', P1:'0,-2', P2:'6', G:'0', y0:'-1', y1:'0', exact:''},
    frobenius1: {order:2, P0:'0,1', P1:'2', P2:'0,9', G:'0', y0:'0', y1:'1', exact:''},
    frobenius2: {order:2, P0:'0,1', P1:'2', P2:'0,-4', G:'0', y0:'0', y1:'1', exact:''},
    eulerlog:   {order:2, P0:'0,0,1', P1:'0,3', P2:'1', G:'0', y0:'0', y1:'1', exact:''}
  };

  document.querySelectorAll('.preset-stub').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = presets[btn.dataset.preset];
      setOrder(p.order);
      if(p.order===1){
        document.getElementById('A_coef').value = p.A;
        document.getElementById('B_coef').value = p.B;
        document.getElementById('y0_1').value = p.y0;
      } else {
        document.getElementById('P0_coef').value = p.P0;
        document.getElementById('P1_coef').value = p.P1;
        document.getElementById('P2_coef').value = p.P2;
        document.getElementById('G_coef').value = p.G;
        document.getElementById('y0_2').value = p.y0;
        document.getElementById('y1_2').value = p.y1;
      }
      document.getElementById('exactSol').value = p.exact;
    });
  });

  // ---------------------------------------------------------
  // 3. UTILIDADES DE POLINOMIOS / SERIES
  // ---------------------------------------------------------
  function parseCoeffs(str){
    if(!str || !str.trim()) return [0];
    const arr = str.split(',').map(s=>parseFloat(s.trim()));
    if(arr.some(v=>isNaN(v))) throw new Error('Coeficientes inválidos: usa números separados por comas.');
    return arr;
  }

  function firstNonzeroIndex(arr){
    for(let i=0;i<arr.length;i++) if(Math.abs(arr[i])>1e-12) return i;
    return -1;
  }

  function shiftUp(arr, k){
    // representa x^k * poly(arr)
    return new Array(k).fill(0).concat(arr);
  }

  // Divide numArr(x)/denArr(x) como serie de potencias truncada a N+1 términos.
  // Devuelve null si la razón tiene un polo en x=0 (no es analítica).
  function seriesDivide(numArr, denArr, N){
    const mNum = firstNonzeroIndex(numArr);
    const mDen = firstNonzeroIndex(denArr);
    if(mDen === -1) return null; // P0(x) idénticamente 0
    if(mNum === -1) return new Array(N+1).fill(0);
    if(mNum < mDen) return null; // polo, no analítica en 0

    const shiftAmt = mNum - mDen;
    const numS = numArr.slice(mNum);
    const denS = denArr.slice(mDen);
    const need = Math.max(1, N - shiftAmt + 1);

    const recip = new Array(need).fill(0);
    recip[0] = 1/denS[0];
    for(let n=1;n<need;n++){
      let s=0;
      for(let i=1;i<=n;i++) s += (denS[i]||0)*(recip[n-i]||0);
      recip[n] = -s/denS[0];
    }
    const quot = new Array(need).fill(0);
    for(let n=0;n<need;n++){
      let s=0;
      for(let i=0;i<=n;i++) s += (numS[i]||0)*(recip[n-i]||0);
      quot[n]=s;
    }
    const result = new Array(N+1).fill(0);
    for(let n=0; n<quot.length && (n+shiftAmt)<=N; n++) result[n+shiftAmt]=quot[n];
    return result;
  }

  // ---------------------------------------------------------
  // 4. MOTOR MATEMÁTICO: recurrencias en punto ordinario
  // ---------------------------------------------------------
  function solveOrder1(A,B,y0,N){
    const a = new Array(N+1).fill(0);
    a[0]=y0;
    for(let n=0;n<=N-1;n++){
      let sum=0;
      for(let i=0;i<=n;i++) sum += (A[i]||0)*a[n-i];
      const Bn = B[n]||0;
      a[n+1] = (sum+Bn)/(n+1);
    }
    return a;
  }

  function solveOrder2(P,Q,R,y0,y1,N){
    // y'' + P(x) y' + Q(x) y = R(x)   (forma estándar, ya dividida entre P0)
    const a = new Array(N+1).fill(0);
    a[0]=y0; a[1]=y1;
    for(let n=0;n<=N-2;n++){
      let sum1=0;
      for(let i=0;i<=n;i++) sum1 += (P[i]||0)*(n-i+1)*(a[n-i+1]||0);
      let sum2=0;
      for(let i=0;i<=n;i++) sum2 += (Q[i]||0)*(a[n-i]||0);
      const Rn = R[n]||0;
      a[n+2] = (Rn - sum1 - sum2) / ((n+2)*(n+1));
    }
    return a;
  }

  // ---------------------------------------------------------
  // 4b. MOTOR DE FROBENIUS (puntos singulares regulares)
  // ---------------------------------------------------------
  function frobeniusIndicial(p0, q0){
    // r(r-1) + p0 r + q0 = 0  <=>  r^2 + (p0-1) r + q0 = 0
    const b = p0-1, c = q0;
    const disc = b*b - 4*c;
    if(disc < -1e-9) return {complex:true};
    const sq = Math.sqrt(Math.max(disc,0));
    const rA = (-b+sq)/2, rB=(-b-sq)/2;
    return {complex:false, r1:Math.max(rA,rB), r2:Math.min(rA,rB)};
  }

  // Resuelve x^2 y'' + x*Ptilde(x) y' + Qtilde(x) y = 0 con y = x^r * sum c_n x^n, c_0=1
  function buildFrobenius(r, Ptilde, Qtilde, N){
    const c = new Array(N+1).fill(0);
    c[0]=1;
    const F = (kr) => kr*(kr-1) + Ptilde[0]*kr + Qtilde[0];
    let resonanceIssue = null;
    for(let k=1;k<=N;k++){
      let rhs=0;
      for(let i=1;i<=k;i++){
        const pi = Ptilde[i]||0, qi = Qtilde[i]||0;
        rhs += (pi*(k-i+r) + qi) * (c[k-i]||0);
      }
      const Fval = F(k+r);
      if(Math.abs(Fval) < 1e-7){
        if(Math.abs(rhs) > 1e-5){
          resonanceIssue = k;
          break;
        } else {
          c[k] = 0;
          continue;
        }
      }
      c[k] = -rhs/Fval;
    }
    return {c, resonanceIssue};
  }

  function evalFrobenius(r, c, x){
    let s=0, p=1;
    for(let n=0;n<c.length;n++){ s += c[n]*p; p*=x; }
    return Math.pow(x, r) * s;
  }

  // ---------------------------------------------------------
  // 4c. RECONOCIMIENTO DE FUNCIONES ELEMENTALES
  // ---------------------------------------------------------
  function factorial(n){ let r=1; for(let i=2;i<=n;i++) r*=i; return r; }

  const knownSeries = [
    {name:'eˣ',       gen:n=> 1/factorial(n)},
    {name:'e⁻ˣ',      gen:n=> (n%2===0?1:-1)/factorial(n)},
    {name:'cos(x)',   gen:n=> (n%2!==0)?0:(((n/2)%2===0)?1:-1)/factorial(n)},
    {name:'sin(x)',   gen:n=> (n%2!==1)?0:((((n-1)/2)%2===0)?1:-1)/factorial(n)},
    {name:'cosh(x)',  gen:n=> (n%2!==0)?0:1/factorial(n)},
    {name:'senh(x)',  gen:n=> (n%2!==1)?0:1/factorial(n)}
  ];

  function recognizeSeries(coefs){
    for(const cand of knownSeries){
      let ok = true;
      for(let n=0;n<coefs.length;n++){
        const expected = cand.gen(n);
        const tol = 1e-6*Math.max(1,Math.abs(expected)) + 1e-9;
        if(Math.abs(coefs[n]-expected) > tol){ ok=false; break; }
      }
      if(ok) return cand.name;
    }
    return null;
  }

  // ---------------------------------------------------------
  // 5. FORMATEO NUMÉRICO
  // ---------------------------------------------------------
  function toFraction(x, tol){
    tol = tol || 1e-7;
    if(Math.abs(x) < tol) return '0';
    const sign = x<0 ? '-' : '';
    x = Math.abs(x);
    let h1=1,h0=0,k1=0,k0=1,b=x;
    for(let i=0;i<24;i++){
      const a = Math.floor(b);
      const h2 = a*h1+h0, k2 = a*k1+k0;
      h0=h1; h1=h2; k0=k1; k1=k2;
      if(Math.abs(x - h1/k1) < tol*x) break;
      if(Math.abs(b-a) < 1e-12) break;
      b = 1/(b-a);
    }
    if(k1===1) return sign+h1.toString();
    if(k1>2000) return null;
    return sign+h1+'/'+k1;
  }

  function formatCoef(x){
    const frac = toFraction(x);
    const dec = (Math.abs(x) < 1e-9) ? '0' : x.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
    if(frac !== null && frac.length <= 9) return frac + '  (' + dec + ')';
    return dec;
  }

  function polyToString(coefs){
    const terms = [];
    coefs.forEach((c,i)=>{
      if(Math.abs(c) < 1e-12) return;
      let t = (i===0) ? formatSimple(c) : (formatSimple(Math.abs(c)) + (i===1 ? 'x' : 'x^'+i));
      if(i>0 && c<0) t = '-'+t; else if(i>0 && c>=0 && terms.length>0) t = '+'+t;
      terms.push(t);
    });
    return terms.length ? terms.join(' ').replace(/\+-/,'-') : '0';
  }
  function formatSimple(c){
    return (Math.abs(c-Math.round(c))<1e-9) ? Math.round(c).toString() : c.toString();
  }

  function trimSeriesString(a, maxNonzero){
    maxNonzero = maxNonzero || 8;
    const parts = [];
    let count = 0;
    for(let n=0; n<a.length && count<maxNonzero; n++){
      const c = a[n];
      if(Math.abs(c) < 1e-12) continue;
      const frac = toFraction(c);
      const coefStr = (frac && frac.length<=7) ? frac : c.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');
      let term;
      if(n===0) term = coefStr;
      else if(n===1) term = `(${coefStr})x`;
      else term = `(${coefStr})x^${n}`;
      parts.push(term);
      count++;
    }
    return (parts.length ? parts.join(' + ').replace(/\+\s\(-/g,'- (') : '0') + ' + ...';
  }

  function buildSeriesString(a){
    const parts = [];
    a.forEach((c,n)=>{
      if(Math.abs(c) < 1e-12) return;
      const frac = toFraction(c);
      const coefStr = (frac && frac.length<=7) ? frac : c.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');
      let term;
      if(n===0) term = coefStr;
      else if(n===1) term = `(${coefStr})x`;
      else term = `(${coefStr})x^${n}`;
      parts.push(term);
    });
    return 'y(x) ≈ ' + (parts.length ? parts.join(' + ').replace(/\+\s\(-/g,'- (') : '0') + ' + ...';
  }

  // ---------------------------------------------------------
  // 6. CLASIFICAR Y RESOLVER (núcleo de orden 2 generalizado)
  // ---------------------------------------------------------
  function classifyAndSolveOrder2(cfg, N){
    const P0=cfg.P0, P1=cfg.P1, P2=cfg.P2, G=cfg.G;
    const mDen = firstNonzeroIndex(P0);
    if(mDen === -1) throw new Error('P₀(x) no puede ser idénticamente cero.');

    if(mDen === 0){
      // x0 = 0 es punto ordinario: se divide toda la ecuación entre P0(x)
      const Pstd = seriesDivide(P1,P0,N);
      const Qstd = seriesDivide(P2,P0,N);
      const Rstd = seriesDivide(G,P0,N);
      return {kind:'ordinary', Pstd, Qstd, Rstd};
    }

    // x0 = 0 anula a P0: candidato a punto singular. Clasificar regular/irregular:
    const xP = seriesDivide(shiftUp(P1,1), P0, N);   // x·P(x)
    const x2Q = seriesDivide(shiftUp(P2,2), P0, N);  // x^2·Q(x)
    if(xP===null || x2Q===null){
      return {kind:'irregular'};
    }
    const p0 = xP[0], q0 = x2Q[0];
    const indic = frobeniusIndicial(p0,q0);
    if(indic.complex){
      return {kind:'complex_roots', p0, q0};
    }
    const r1=indic.r1, r2=indic.r2;
    const sol1 = buildFrobenius(r1, xP, x2Q, N);
    let sol2 = null, needsLog=false;
    const diff = r1-r2;

    if(Math.abs(diff) < 1e-6){
      needsLog = true; // Caso III: raíces iguales -> siempre requiere log
    } else {
      const attempt2 = buildFrobenius(r2, xP, x2Q, N);
      if(attempt2.resonanceIssue){
        needsLog = true; // Caso II con obstrucción -> requiere log
      } else {
        sol2 = attempt2;
      }
    }
    return {kind:'singular', p0, q0, r1, r2, sol1, sol2, needsLog, xP, x2Q};
  }

  // ---------------------------------------------------------
  // 7. GENERAR EXPLICACIÓN PASO A PASO
  // ---------------------------------------------------------
  function buildSteps(cfg){
    const steps = [];

    if(cfg.order===1){
      steps.push({
        title:'Se propone la solución en serie',
        body:`Alrededor de x₀ = 0 (los coeficientes son polinomios, funciones analíticas en todo x), se asume que la solución tiene la forma:`,
        math:`y(x) = Σ aₙxⁿ  =  a₀ + a₁x + a₂x² + a₃x³ + ...`
      });
      steps.push({
        title:'Se deriva término a término',
        body:`Derivando la serie propuesta y reindexando con k = n − 1:`,
        math:`y' = Σ (n)aₙx^(n-1)  =  Σ (k+1)a_(k+1)x^k`
      });
      steps.push({
        title:'Se sustituye en la ecuación',
        body:`La ecuación ingresada es y' = A(x)·y + B(x), con A(x) = ${polyToString(cfg.A)} y B(x) = ${polyToString(cfg.B)}. Sustituyendo la serie de y y de y' y expandiendo el producto A(x)·y como un producto de series (convolución de Cauchy):`,
        math:`Σ(k+1)a_(k+1)x^k  =  A(x)·Σaₙxⁿ + B(x)`
      });
      steps.push({
        title:'Se igualan los coeficientes de xⁿ',
        body:`Para que ambas series sean iguales para todo x, el coeficiente de xⁿ debe coincidir en ambos lados. Esto produce la relación de recurrencia general:`,
        math:`a_(n+1) = [ Σ_{i=0}^{n} A_i · a_(n-i)  +  B_n ] / (n+1)`
      });
      steps.push({
        title:'Se fija el coeficiente libre con la condición inicial',
        body:`El único coeficiente libre es a₀ = y(0) = ${cfg.y0}. A partir de él, la recurrencia genera todos los demás.`,
        math:null
      });
      let coefLines = cfg.a.map((val,n)=>`a_${n} = ${formatCoef(val)}`).join('\n');
      steps.push({
        title:'Se calculan los coeficientes por recurrencia',
        body:`Aplicando la fórmula anterior sucesivamente para n = 0, 1, 2, ... se obtienen los primeros ${cfg.a.length} coeficientes:`,
        math: coefLines
      });
      steps.push({
        title:'Solución particular en serie de potencia',
        body:`Sustituyendo los coeficientes en la serie propuesta, la solución aproximada (truncada a ${cfg.a.length} términos) que satisface la condición inicial dada es:`,
        math: buildSeriesString(cfg.a)
      });
      steps.push({
        title:'Convergencia',
        body:`Como A(x) y B(x) son polinomios, son funciones enteras (analíticas en todo ℝ). Por lo tanto x₀ = 0 es punto ordinario y el radio de convergencia de la serie solución es infinito.`,
        math:null
      });
      return steps;
    }

    // ---------- ORDEN 2 ----------
    const P0str = polyToString(cfg.P0), P1str = polyToString(cfg.P1), P2str = polyToString(cfg.P2), Gstr = polyToString(cfg.G);

    steps.push({
      title:'Ecuación ingresada y clasificación de x₀ = 0',
      body:`La ecuación es P₀(x)y'' + P₁(x)y' + P₂(x)y = G(x), con P₀(x) = ${P0str}, P₁(x) = ${P1str}, P₂(x) = ${P2str}, G(x) = ${Gstr}. En la forma estándar y'' + P(x)y' + Q(x)y = R(x), un punto x₀ es <b>ordinario</b> si P(x) y Q(x) son analíticas en x₀ (equivalentemente, si P₀(x₀) ≠ 0); en caso contrario es <b>singular</b>.`,
      math: `P₀(0) = ${cfg.P0[0]||0}  ⇒  x₀ = 0 es ${cfg.result.kind==='ordinary' ? 'PUNTO ORDINARIO' : 'PUNTO SINGULAR (P₀(0)=0)'}`
    });

    if(cfg.result.kind==='ordinary'){
      steps.push({
        title:'Se divide toda la ecuación entre P₀(x)',
        body:`Para llevar la ecuación a la forma estándar y'' + P(x)y' + Q(x)y = R(x), se divide entre P₀(x) (como serie de potencias, ya que P₀(0) ≠ 0):`,
        math:`P(x) = P₁(x)/P₀(x) ≈ ${trimSeriesString(cfg.result.Pstd,6)}\nQ(x) = P₂(x)/P₀(x) ≈ ${trimSeriesString(cfg.result.Qstd,6)}\nR(x) = G(x)/P₀(x) ≈ ${trimSeriesString(cfg.result.Rstd,6)}`
      });
      steps.push({
        title:'Se propone la solución en serie',
        body:`Alrededor del punto ordinario x₀ = 0, se asume que la solución tiene la forma:`,
        math:`y(x) = Σ aₙxⁿ  =  a₀ + a₁x + a₂x² + a₃x³ + ...`
      });
      steps.push({
        title:'Se deriva dos veces',
        body:`Derivando la serie propuesta dos veces y reindexando cada una:`,
        math:`y'  = Σ (k+1)a_(k+1)x^k\ny'' = Σ (k+2)(k+1)a_(k+2)x^k`
      });
      steps.push({
        title:'Se sustituye y se igualan los coeficientes de xⁿ',
        body:`Sustituyendo en y'' + P(x)y' + Q(x)y = R(x) y expandiendo los productos como convoluciones de Cauchy, se iguala el coeficiente de xⁿ en ambos lados, obteniendo la relación de recurrencia general:`,
        math:`a_(n+2) = [ R_n − Σ_{i=0}^{n} P_i(n-i+1)a_(n-i+1) − Σ_{i=0}^{n} Q_i·a_(n-i) ] / [(n+2)(n+1)]`
      });
      steps.push({
        title:'Se fijan los coeficientes libres con las condiciones iniciales',
        body:`Los coeficientes libres son a₀ = y(0) = ${cfg.y0} y a₁ = y'(0) = ${cfg.y1}. A partir de ellos, la recurrencia genera todos los demás.`,
        math:null
      });
      let coefLines = cfg.a.map((val,n)=>`a_${n} = ${formatCoef(val)}`).join('\n');
      steps.push({
        title:'Se calculan los coeficientes por recurrencia',
        body:`Aplicando la fórmula anterior sucesivamente para n = 0, 1, 2, ... se obtienen los primeros ${cfg.a.length} coeficientes:`,
        math: coefLines
      });
      steps.push({
        title:'Solución particular en serie de potencia',
        body:`Sustituyendo los coeficientes en la serie propuesta, la solución aproximada (truncada a ${cfg.a.length} términos) es:`,
        math: buildSeriesString(cfg.a)
      });
      steps.push({
        title:'Convergencia',
        body:`El radio de convergencia de la solución es, como mínimo, la distancia de x₀=0 al punto singular más cercano de la ecuación (raíz de P₀(x) más próxima a 0).`,
        math:null
      });

    } else if(cfg.result.kind==='irregular'){
      steps.push({
        title:'Clasificación: punto singular irregular',
        body:`Se calculan p(x) = P₁(x)/P₀(x) y q(x) = P₂(x)/P₀(x). Un punto singular x₀=0 es <b>regular</b> si x·p(x) y x²·q(x) son analíticas en 0. En esta ecuación al menos una de esas dos funciones conserva un polo en x=0, por lo que x₀=0 es un <b>punto singular irregular</b>.`,
        math:null
      });
      steps.push({
        title:'Alcance de esta herramienta',
        body:`El teorema de Frobenius solo garantiza una solución en serie cuando el punto singular es <b>regular</b>. Para puntos singulares irregulares se requieren técnicas adicionales (fuera del alcance de esta herramienta).`,
        math:null
      });
    } else if(cfg.result.kind==='complex_roots'){
      steps.push({
        title:'Punto singular regular, pero raíces indiciales complejas',
        body:`x₀=0 es un punto singular regular (p₀ = ${cfg.result.p0.toFixed(4)}, q₀ = ${cfg.result.q0.toFixed(4)}), pero la ecuación indicial r(r−1) + p₀r + q₀ = 0 tiene raíces complejas. Este caso (soluciones con factor xᵅcos(β ln x), xᵅsin(β ln x)) está fuera del alcance de esta herramienta.`,
        math:`r² + (${(cfg.result.p0-1).toFixed(4)})r + ${cfg.result.q0.toFixed(4)} = 0   (discriminante < 0)`
      });
    } else if(cfg.result.kind==='singular'){
      const r = cfg.result;
      steps.push({
        title:'Clasificación: punto singular regular',
        body:`Se calculan p(x)=P₁(x)/P₀(x), q(x)=P₂(x)/P₀(x). Como x·p(x) y x²·q(x) son analíticas en x=0, x₀=0 es un <b>punto singular regular</b> y se aplica el método de Frobenius.`,
        math:`p₀ = lím x·p(x) = ${r.p0.toFixed(6)}\nq₀ = lím x²·q(x) = ${r.q0.toFixed(6)}`
      });
      steps.push({
        title:'Ecuación indicial',
        body:`Según el teorema de Frobenius, se propone y(x) = xʳΣcₙxⁿ. Sustituyendo el término de menor orden se obtiene la ecuación indicial:`,
        math:`r(r-1) + p₀·r + q₀ = 0   ⇒   r² ${(r.p0-1)>=0?'+':'-'} ${Math.abs(r.p0-1).toFixed(4)}r ${r.q0>=0?'+':'-'} ${Math.abs(r.q0).toFixed(4)} = 0\n\nRaíces indiciales:  r₁ = ${r.r1.toFixed(6)}   ,   r₂ = ${r.r2.toFixed(6)}`
      });
      const diff = r.r1-r.r2;
      let caseText;
      if(Math.abs(diff)<1e-6) caseText = 'Caso III: raíces indiciales iguales (r₁ = r₂). Siempre se necesita un término logarítmico para y₂.';
      else if(Math.abs(diff-Math.round(diff))<1e-6 && Math.round(diff)>0) caseText = `Caso II: r₁ − r₂ = ${Math.round(diff)} es un entero positivo. Puede o no requerirse un término logarítmico para y₂ (se verifica directamente al construir la recurrencia).`;
      else caseText = 'Caso I: r₁ y r₂ son distintas y no difieren en un entero. Existen dos soluciones de Frobenius linealmente independientes, sin términos logarítmicos.';
      steps.push({
        title:'Caso según la diferencia de raíces indiciales',
        body:caseText,
        math:null
      });
      steps.push({
        title:'Se construye la primera solución (r₁, siempre válida)',
        body:`Con r = r₁ = ${r.r1.toFixed(6)} y c₀ = 1, la recurrencia para los cₙ nunca se anula (r₁ es la raíz mayor), por lo que y₁(x) = xʳ¹Σcₙxⁿ siempre existe:`,
        math: `y₁(x) = x^(${r.r1.toFixed(4)}) · [ ${trimSeriesString(r.sol1.c,6)} ]`
      });
      if(r.sol2){
        steps.push({
          title:'Se construye la segunda solución (r₂)',
          body:`Con r = r₂ = ${r.r2.toFixed(6)} la recurrencia no presenta obstrucciones (no se necesita término logarítmico), por lo que y₂(x) = xʳ²Σbₙxⁿ es una segunda solución válida, linealmente independiente:`,
          math: `y₂(x) = x^(${r.r2.toFixed(4)}) · [ ${trimSeriesString(r.sol2.c,6)} ]`
        });
      } else {
        steps.push({
          title:'Segunda solución: requiere término logarítmico',
          body:`Al construir la serie con r = r₂ = ${r.r2.toFixed(6)}, la recurrencia se indefine (0/0) en un término y el numerador no se anula ahí, señal de que y₂ necesariamente incluye un término C·y₁(x)·ln(x). Ese caso está fuera del alcance de esta herramienta: solo se garantiza y₁(x).`,
          math:null
        });
      }
      steps.push({
        title:'Validez de la solución',
        body:`Las soluciones de Frobenius y₁ (y y₂, si existe) son válidas en el intervalo x₀ &lt; x &lt; ρ (aquí, para x&gt;0), donde ρ es la distancia de x₀=0 a la singularidad más cercana de la ecuación.`,
        math:null
      });
    }

    return steps;
  }

  function renderSteps(steps){
    const container = document.getElementById('stepsContainer');
    container.innerHTML = '';
    steps.forEach((s,idx)=>{
      const div = document.createElement('div');
      div.className='step';
      div.innerHTML = `
        <div class="step-num">${String(idx+1).padStart(2,'0')}</div>
        <div>
          <p class="step-title">${s.title}</p>
          <p class="step-body">${s.body}</p>
          ${s.math ? `<code class="math">${s.math}</code>` : ''}
        </div>`;
      container.appendChild(div);
    });
  }

  function renderBadge(cfg){
    const el = document.getElementById('classificationBadge');
    if(cfg.order===1){ el.innerHTML=''; return; }
    const kind = cfg.result.kind;
    let cls='badge-ordinary', txt='PUNTO ORDINARIO';
    if(kind==='singular'){ cls='badge-singular'; txt='PUNTO SINGULAR REGULAR · MÉTODO DE FROBENIUS'; }
    else if(kind==='irregular'){ cls='badge-irregular'; txt='PUNTO SINGULAR IRREGULAR'; }
    else if(kind==='complex_roots'){ cls='badge-irregular'; txt='SINGULAR REGULAR · RAÍCES INDICIALES COMPLEJAS'; }
    el.innerHTML = `<span class="classification-badge ${cls}">${txt}</span>`;
  }

  // ---------------------------------------------------------
  // 8. SOLUCIÓN GENERAL (ORDEN 1, ORDEN 2 ORDINARIO Y FROBENIUS)
  // ---------------------------------------------------------
  function buildGeneralOrder1(cfg,N){
    const yh = solveOrder1(cfg.A, [0], 1, N);
    const yp = solveOrder1(cfg.A, cfg.B, 0, N);
    const recognized = recognizeSeries(yh);
    const hasP = yp.some(v=>Math.abs(v)>1e-12);
    return {yh,yp,recognized,hasP};
  }

  function buildGeneralOrder2(cfg,N){
    const P=cfg.result.Pstd, Q=cfg.result.Qstd, R=cfg.result.Rstd;
    const y1 = solveOrder2(P,Q,[0], 1,0,N);
    const y2 = solveOrder2(P,Q,[0], 0,1,N);
    const hasR = R.some(v=>Math.abs(v)>1e-12);
    const yp = hasR ? solveOrder2(P,Q,R, 0,0,N) : null;
    const rec1 = recognizeSeries(y1);
    const rec2 = recognizeSeries(y2);
    return {y1,y2,yp,hasR,rec1,rec2};
  }

  function renderGeneralSolution(cfg,N){
    const panel = document.getElementById('generalSolPanel');
    const body = document.getElementById('generalSolBody');
    const title = document.getElementById('generalSolTitle');
    const sub = document.getElementById('generalSolSub');
    panel.classList.remove('panel-warning','panel-frobenius');
    let html = '';

    if(cfg.order===1){
      title.textContent = 'Solución general de la ecuación';
      sub.textContent = 'Familia completa de soluciones, construida a partir del teorema de existencia alrededor de un punto ordinario.';
      const g = buildGeneralOrder1(cfg,N);
      html += `<p class="step-body">El conjunto de soluciones de la ecuación homogénea asociada y' = A(x)y tiene dimensión uno. Por lo tanto la solución general de y' = A(x)y + B(x) es:</p>`;
      html += `<code class="math math-highlight">y(x)  =  C · y_h(x)  +  y_p(x)</code>`;
      html += `<p class="step-body">donde y_h es la solución de la ecuación homogénea con y_h(0) = 1, y y_p es una solución particular con y_p(0) = 0:</p>`;
      html += `<code class="math">y_h(x) ≈ ${trimSeriesString(g.yh)}${g.recognized ? `<span class="recognized-tag">≡ ${g.recognized}</span>` : ''}</code>`;
      if(g.hasP){
        html += `<code class="math">y_p(x) ≈ ${trimSeriesString(g.yp)}</code>`;
      } else {
        html += `<p class="step-body">Como B(x) = 0, la ecuación es homogénea y la solución particular es y_p(x) = 0.</p>`;
      }
      html += `<p class="step-body">La solución con la condición inicial dada corresponde a tomar <strong>C = y(0) = ${cfg.y0}</strong> en la fórmula anterior; esa es la curva trazada en la gráfica.</p>`;

    } else if(cfg.result.kind==='ordinary'){
      title.textContent = 'Solución general de la ecuación (punto ordinario)';
      sub.textContent = 'Familia completa de soluciones, construida a partir del teorema de existencia de soluciones en series de potencia alrededor de un punto ordinario.';
      const g = buildGeneralOrder2(cfg,N);
      html += `<p class="step-body">Como x₀ = 0 es punto ordinario, el teorema de existencia garantiza dos soluciones linealmente independientes y₁, y₂ de la ecuación homogénea asociada, de modo que la solución general de la ecuación completa es:</p>`;
      html += `<code class="math math-highlight">y(x)  =  C₁ y₁(x)  +  C₂ y₂(x)${g.hasR ? '  +  y_p(x)' : ''}</code>`;
      html += `<code class="math">y₁(x) ≈ ${trimSeriesString(g.y1)}${g.rec1 ? `<span class="recognized-tag">≡ ${g.rec1}</span>` : ''}\ny₂(x) ≈ ${trimSeriesString(g.y2)}${g.rec2 ? `<span class="recognized-tag">≡ ${g.rec2}</span>` : ''}</code>`;
      if(g.hasR){
        html += `<code class="math">y_p(x) ≈ ${trimSeriesString(g.yp)}</code>`;
      }
      if(!g.rec1 && !g.rec2){
        html += `<p class="step-body">Esta herramienta no reconoce a y₁ ni a y₂ como combinaciones de funciones elementales básicas (eˣ, sin x, cos x, sinh x, cosh x): puede tratarse de un polinomio (como en Legendre) o de una función especial (como en Airy).</p>`;
      }
      html += `<p class="step-body">La solución con las condiciones iniciales dadas corresponde a tomar <strong>C₁ = y(0) = ${cfg.y0}</strong> y <strong>C₂ = y'(0) = ${cfg.y1}</strong>; esa es la curva trazada en la gráfica.</p>`;
      cfg.generalObj = g;

    } else if(cfg.result.kind==='singular'){
      panel.classList.add('panel-frobenius');
      title.textContent = 'Solución general (Frobenius, punto singular regular)';
      sub.textContent = 'Construida con el teorema de Frobenius alrededor del punto singular regular x₀ = 0. Válida para x > 0.';
      const r = cfg.result;
      html += `<p class="step-body">Con raíces indiciales r₁ = ${r.r1.toFixed(6)} y r₂ = ${r.r2.toFixed(6)}, la solución general (cuando existen ambas series) es:</p>`;
      if(r.sol2){
        html += `<code class="math math-highlight">y(x) = C₁·x^(${r.r1.toFixed(4)})Σcₙxⁿ + C₂·x^(${r.r2.toFixed(4)})Σbₙxⁿ</code>`;
        html += `<code class="math math-violet">y₁(x) = x^(${r.r1.toFixed(4)})·[ ${trimSeriesString(r.sol1.c,6)} ]\ny₂(x) = x^(${r.r2.toFixed(4)})·[ ${trimSeriesString(r.sol2.c,6)} ]</code>`;
      } else {
        html += `<code class="math math-highlight">y₁(x) = x^(${r.r1.toFixed(4)})Σcₙxⁿ   (solución garantizada por Frobenius)</code>`;
        html += `<code class="math math-violet">y₁(x) = x^(${r.r1.toFixed(4)})·[ ${trimSeriesString(r.sol1.c,6)} ]</code>`;
        html += `<p class="step-body">La segunda solución y₂ requiere un término C·y₁(x)·ln(x) adicional, que está fuera del alcance de esta herramienta (se muestra solo y₁).</p>`;
      }
      html += `<p class="step-body">No se piden condiciones iniciales en x₀=0 (por ser punto singular, y o y' pueden no estar acotadas allí); se grafican las soluciones base para x&gt;0.</p>`;

    } else if(cfg.result.kind==='irregular'){
      panel.classList.add('panel-warning');
      title.textContent = 'Punto singular irregular';
      sub.textContent = '';
      html += `<p class="step-body">x₀=0 es un punto singular <b>irregular</b>: el teorema de Frobenius no garantiza una solución en serie de la forma xʳΣcₙxⁿ. Esta herramienta no resuelve este caso.</p>`;
    } else if(cfg.result.kind==='complex_roots'){
      panel.classList.add('panel-warning');
      title.textContent = 'Raíces indiciales complejas';
      sub.textContent = '';
      html += `<p class="step-body">La ecuación indicial tiene raíces complejas conjugadas. Las soluciones tendrían la forma xᵅ[cos(β ln x)·(...) ± sin(β ln x)·(...)], un caso fuera del alcance de esta herramienta.</p>`;
    }

    body.innerHTML = html;
    panel.style.display = 'block';
  }

  function renderTable(cfg){
    const table = document.getElementById('coefTable');
    const titleEl = document.getElementById('tableTitle');
    const panel = document.getElementById('tablePanel');

    if(cfg.order===1 || cfg.result.kind==='ordinary'){
      titleEl.textContent = 'Coeficientes aₙ';
      let html = '<tr><th>n</th><th>aₙ</th><th>valor decimal</th></tr>';
      cfg.a.forEach((v,n)=>{
        html += `<tr><td>${n}</td><td class="coef">${toFraction(v) || '—'}</td><td>${v.toFixed(8)}</td></tr>`;
      });
      table.innerHTML = html;
      panel.style.display='block';
    } else if(cfg.result.kind==='singular'){
      titleEl.textContent = 'Coeficientes de Frobenius (cₙ para y₁, bₙ para y₂)';
      const r = cfg.result;
      let html = r.sol2 ? '<tr><th>n</th><th>cₙ (y₁)</th><th>bₙ (y₂)</th></tr>' : '<tr><th>n</th><th>cₙ (y₁)</th></tr>';
      const len = r.sol1.c.length;
      for(let n=0;n<len;n++){
        if(r.sol2){
          html += `<tr><td>${n}</td><td class="coef">${toFraction(r.sol1.c[n])||'—'}</td><td class="coef2">${toFraction(r.sol2.c[n])||'—'}</td></tr>`;
        } else {
          html += `<tr><td>${n}</td><td class="coef">${toFraction(r.sol1.c[n])||'—'}</td></tr>`;
        }
      }
      table.innerHTML = html;
      panel.style.display='block';
    } else {
      panel.style.display='none';
    }
  }

  // ---------------------------------------------------------
  // 9. EVALUACIÓN Y GRÁFICA
  // ---------------------------------------------------------
  function evalSeries(a, x){
    let s=0, p=1;
    for(let n=0;n<a.length;n++){ s += a[n]*p; p*=x; }
    return s;
  }

  function makeExactFn(expr){
    if(!expr || !expr.trim()) return null;
    try{
      const fn = new Function('x', 'with(Math){ return ' + expr + '; }');
      fn(0.3);
      return fn;
    }catch(e){ return null; }
  }

  function drawPlot(canvas, xs, seriesY, exactY, seriesY2){
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth * 2;
    const H = canvas.height = 360*2;
    ctx.clearRect(0,0,W,H);

    let allY = seriesY.slice();
    if(seriesY2) allY = allY.concat(seriesY2.filter(v=>isFinite(v)));
    if(exactY) allY = allY.concat(exactY.filter(v=>isFinite(v)));
    allY = allY.filter(v=>isFinite(v));
    let yMin = Math.min(...allY), yMax = Math.max(...allY);
    if(yMin===yMax){ yMin-=1; yMax+=1; }
    const pad = (yMax-yMin)*0.12;
    yMin -= pad; yMax += pad;

    const xMin = xs[0], xMax = xs[xs.length-1];
    const marginL=70, marginR=30, marginT=24, marginB=46;
    const plotW = W - marginL - marginR;
    const plotH = H - marginT - marginB;

    function px(x){ return marginL + (x-xMin)/(xMax-xMin)*plotW; }
    function py(y){ return marginT + (1-(y-yMin)/(yMax-yMin))*plotH; }

    ctx.strokeStyle = 'rgba(238,231,214,0.08)';
    ctx.lineWidth=1;
    const xTicks=8, yTicks=6;
    ctx.font='22px IBM Plex Mono, monospace';
    ctx.fillStyle='rgba(238,231,214,0.45)';
    for(let i=0;i<=xTicks;i++){
      const xv = xMin + (xMax-xMin)*i/xTicks;
      const X = px(xv);
      ctx.beginPath(); ctx.moveTo(X,marginT); ctx.lineTo(X,H-marginB); ctx.stroke();
      ctx.fillText(xv.toFixed(1), X-14, H-marginB+30);
    }
    for(let i=0;i<=yTicks;i++){
      const yv = yMin + (yMax-yMin)*i/yTicks;
      const Y = py(yv);
      ctx.beginPath(); ctx.moveTo(marginL,Y); ctx.lineTo(W-marginR,Y); ctx.stroke();
      ctx.fillText(yv.toFixed(2), 8, Y+6);
    }
    ctx.strokeStyle='rgba(238,231,214,0.35)';
    if(xMin<=0 && xMax>=0){ ctx.beginPath(); ctx.moveTo(px(0),marginT); ctx.lineTo(px(0),H-marginB); ctx.stroke(); }
    if(yMin<=0 && yMax>=0){ ctx.beginPath(); ctx.moveTo(marginL,py(0)); ctx.lineTo(W-marginR,py(0)); ctx.stroke(); }

    function chalkLine(color, ys){
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath();
      let started=false;
      for(let i=0;i<xs.length;i++){
        const yv = ys[i];
        if(!isFinite(yv) || yv<yMin-pad*4 || yv>yMax+pad*4){ started=false; continue; }
        const X = px(xs[i]), Y = py(yv);
        if(!started){ ctx.moveTo(X,Y); started=true; } else { ctx.lineTo(X,Y); }
      }
      ctx.stroke();
    }

    if(exactY) chalkLine(getCss('--chalk-teal'), exactY);
    chalkLine(getCss('--chalk-coral'), seriesY);
    if(seriesY2) chalkLine(getCss('--chalk-violet'), seriesY2);
  }

  function getCss(varName){
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function drawErrorPlot(canvas, xs, errY){
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth*2;
    const H = canvas.height = 200*2;
    ctx.clearRect(0,0,W,H);

    const logErr = errY.map(e => Math.log10(Math.max(e,1e-16)));
    let yMin = Math.min(...logErr.filter(isFinite));
    let yMax = Math.max(...logErr.filter(isFinite));
    if(yMin===yMax){yMin-=1;yMax+=1;}
    const xMin=xs[0], xMax=xs[xs.length-1];
    const marginL=70, marginR=30, marginT=16, marginB=40;
    const plotW=W-marginL-marginR, plotH=H-marginT-marginB;
    function px(x){ return marginL+(x-xMin)/(xMax-xMin)*plotW; }
    function py(y){ return marginT+(1-(y-yMin)/(yMax-yMin))*plotH; }

    ctx.strokeStyle='rgba(238,231,214,0.08)';
    ctx.font='20px IBM Plex Mono, monospace';
    ctx.fillStyle='rgba(238,231,214,0.45)';
    for(let i=0;i<=6;i++){
      const xv = xMin+(xMax-xMin)*i/6;
      const X = px(xv);
      ctx.beginPath(); ctx.moveTo(X,marginT); ctx.lineTo(X,H-marginB); ctx.stroke();
      ctx.fillText(xv.toFixed(1), X-12, H-marginB+26);
    }
    const yTicks=4;
    for(let i=0;i<=yTicks;i++){
      const yv = yMin+(yMax-yMin)*i/yTicks;
      const Y=py(yv);
      ctx.beginPath(); ctx.moveTo(marginL,Y); ctx.lineTo(W-marginR,Y); ctx.stroke();
      ctx.fillText('1e'+yv.toFixed(0), 6, Y+5);
    }
    ctx.strokeStyle = getCss('--chalk-yellow');
    ctx.lineWidth=4; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    let started=false;
    for(let i=0;i<xs.length;i++){
      if(!isFinite(logErr[i])) { started=false; continue; }
      const X=px(xs[i]), Y=py(logErr[i]);
      if(!started){ctx.moveTo(X,Y); started=true;} else {ctx.lineTo(X,Y);}
    }
    ctx.stroke();
  }

  // ---------------------------------------------------------
  // 10. FLUJO PRINCIPAL
  // ---------------------------------------------------------
  document.getElementById('solveBtn').addEventListener('click', ()=>{
    const errBox = document.getElementById('errorBox');
    errBox.style.display='none';
    try{
      const N = Math.max(4, Math.min(30, parseInt(document.getElementById('nTerms').value,10) || 14));
      const xR = Math.abs(parseFloat(document.getElementById('xRange').value)) || 3;

      let cfg = {order, y0:null, y1:null, a:null};

      if(order===1){
        const A = parseCoeffs(document.getElementById('A_coef').value);
        const B = parseCoeffs(document.getElementById('B_coef').value);
        const y0 = parseFloat(document.getElementById('y0_1').value);
        if(isNaN(y0)) throw new Error('y(0) debe ser un número.');
        const a = solveOrder1(A,B,y0,N);
        cfg = Object.assign(cfg, {A,B,y0,a});
      } else {
        const P0 = parseCoeffs(document.getElementById('P0_coef').value);
        const P1 = parseCoeffs(document.getElementById('P1_coef').value);
        const P2 = parseCoeffs(document.getElementById('P2_coef').value);
        const G  = parseCoeffs(document.getElementById('G_coef').value);
        const y0 = parseFloat(document.getElementById('y0_2').value);
        const y1 = parseFloat(document.getElementById('y1_2').value);
        cfg = Object.assign(cfg, {P0,P1,P2,G,y0,y1});
        cfg.result = classifyAndSolveOrder2(cfg, N);
        if(cfg.result.kind==='ordinary'){
          if(isNaN(y0) || isNaN(y1)) throw new Error("y(0) e y'(0) deben ser números.");
          cfg.a = solveOrder2(cfg.result.Pstd, cfg.result.Qstd, cfg.result.Rstd, y0, y1, N);
        }
      }

      renderBadge(cfg);
      renderSteps(buildSteps(cfg));

      const plotPanel = document.getElementById('plotPanel');
      const tablePanel = document.getElementById('tablePanel');
      const generalPanel = document.getElementById('generalSolPanel');

      if(order===2 && (cfg.result.kind==='irregular' || cfg.result.kind==='complex_roots')){
        renderGeneralSolution(cfg,N);
        tablePanel.style.display='none';
        plotPanel.style.display='none';
        document.getElementById('stepsContainer').scrollIntoView({behavior:'smooth', block:'nearest'});
        return;
      }

      renderGeneralSolution(cfg,N);
      renderTable(cfg);

      // ------- gráfica -------
      let xs, seriesY, seriesY2=null, exactY=null;
      const legendSeriesLabel = document.getElementById('legendSeriesLabel');
      const legendSecond = document.getElementById('legendSecond');
      const legendExact = document.getElementById('legendExact');
      const noteEl = document.getElementById('plotNote');
      const errWrap = document.getElementById('errorWrap');

      if(order===1 || cfg.result.kind==='ordinary'){
        legendSeriesLabel.textContent = 'Serie de potencia';
        legendSecond.style.display='none';
        const steps_=400;
        xs=[]; for(let i=0;i<=steps_;i++) xs.push(-xR + (2*xR)*i/steps_);
        seriesY = xs.map(x=>evalSeries(cfg.a, x));

        const exactExpr = document.getElementById('exactSol').value;
        const exactFn = makeExactFn(exactExpr);
        exactY = exactFn ? xs.map(x=>{ try{ return exactFn(x);}catch(e){return NaN;} }) : null;
        legendExact.style.display = exactY ? 'inline-flex' : 'none';

        drawPlot(document.getElementById('plotCanvas'), xs, seriesY, exactY, null);

        if(exactY){
          const errY = xs.map((x,i)=> Math.abs(exactY[i]-seriesY[i]));
          drawErrorPlot(document.getElementById('errorCanvas'), xs, errY);
          errWrap.style.display='block';
          noteEl.textContent = `Comparando con la solución exacta ingresada. El error crece cerca de los bordes por truncar la serie a ${N} términos.`;
        } else {
          errWrap.style.display='none';
          noteEl.textContent = exactExpr.trim()
            ? 'No se pudo interpretar la solución exacta ingresada; se muestra solo la serie de potencia.'
            : `Serie de potencia truncada a ${N} términos. Revisa el panel "Solución general" para ver si la herramienta reconoció una forma cerrada.`;
        }
      } else if(cfg.result.kind==='singular'){
        legendSeriesLabel.textContent = 'y₁ (Frobenius, r₁)';
        legendExact.style.display='none';
        const r = cfg.result;
        const steps_=400;
        const xStart = Math.max(1e-3, xR*0.01);
        xs=[]; for(let i=0;i<=steps_;i++) xs.push(xStart + (xR-xStart)*i/steps_);
        seriesY = xs.map(x=>evalFrobenius(r.r1, r.sol1.c, x));
        if(r.sol2){
          legendSecond.style.display='inline-flex';
          seriesY2 = xs.map(x=>evalFrobenius(r.r2, r.sol2.c, x));
        } else {
          legendSecond.style.display='none';
        }
        drawPlot(document.getElementById('plotCanvas'), xs, seriesY, null, seriesY2);
        errWrap.style.display='none';
        noteEl.textContent = `Punto singular regular: solo se grafica para x > 0 (dominio válido de la serie de Frobenius, x^r con r no entero).`;
      }

      plotPanel.style.display='block';
      document.getElementById('stepsContainer').scrollIntoView({behavior:'smooth', block:'nearest'});

    }catch(e){
      errBox.textContent = 'Error: ' + e.message;
      errBox.style.display='block';
    }
  });

  window.addEventListener('resize', ()=>{
    const btn = document.getElementById('solveBtn');
    if(document.getElementById('plotPanel').style.display==='block') btn.click();
  });

})();
