const { test, expect } = require('@playwright/test');

function collectErrors(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{ if(message.type()==='error') errors.push(message.text()); });
  return errors;
}

async function waitForMap(page){
  const viewport=page.locator('#mapViewport');
  await page.goto('/?map=12345',{waitUntil:'domcontentloaded'});
  await expect(viewport).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#mapStatus')).toBeHidden();
  await expect(page.locator('#map')).toBeVisible();
  return viewport;
}

test.describe('mobile map',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});

  test('renders, reads, zooms proportionally, and accepts a map tap',async({page})=>{
    const errors=collectErrors(page);
    const viewport=await waitForMap(page);
    const map=page.locator('#map');

    const viewportBox=await viewport.boundingBox();
    const mapBox=await map.boundingBox();
    expect(viewportBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(viewportBox.width).toBeGreaterThan(350);
    expect(Math.abs(viewportBox.width-viewportBox.height)).toBeLessThan(3);
    expect(mapBox.width).toBeGreaterThan(350);
    expect(Math.abs(mapBox.width-mapBox.height)).toBeLessThan(3);

    const pixels=await map.evaluate(canvas=>{
      const context=canvas.getContext('2d');
      if(!context) return {colors:0,opaque:0};
      const data=context.getImageData(0,0,canvas.width,canvas.height).data;
      const colors=new Set();
      let opaque=0;
      for(let y=0;y<canvas.height;y+=24){
        for(let x=0;x<canvas.width;x+=24){
          const i=(y*canvas.width+x)*4;
          colors.add(data[i]+','+data[i+1]+','+data[i+2]+','+data[i+3]);
          if(data[i+3]>0) opaque++;
        }
      }
      return {colors:colors.size,opaque};
    });
    expect(pixels.colors).toBeGreaterThan(8);
    expect(pixels.opaque).toBeGreaterThan(500);

    await page.locator('#tgScale').click();
    const scale=page.locator('#scale');
    await expect(scale).toBeVisible();
    const scaleText=await page.locator('#scaleSvg').textContent();
    expect(scaleText).toContain('1:25');
    expect(scaleText).not.toMatch(/빨간|격자선 눈금|남북/);

    const frame=page.locator('#frame');
    let frameBox=await frame.boundingBox();
    let scaleBox=await scale.boundingBox();
    expect(Math.abs(scaleBox.width/frameBox.width-.2)).toBeLessThan(.01);

    await page.locator('#zoomIn').click();
    await expect(page.locator('#zoomRead')).toHaveText('150%');
    frameBox=await frame.boundingBox();
    scaleBox=await scale.boundingBox();
    const zoomedViewportBox=await viewport.boundingBox();
    expect(frameBox.width/zoomedViewportBox.width).toBeGreaterThan(1.45);
    expect(frameBox.width/zoomedViewportBox.width).toBeLessThan(1.55);
    expect(Math.abs(scaleBox.width/frameBox.width-.2)).toBeLessThan(.01);
    const visibleWidth=Math.min(scaleBox.x+scaleBox.width,zoomedViewportBox.x+zoomedViewportBox.width)
      -Math.max(scaleBox.x,zoomedViewportBox.x);
    const visibleHeight=Math.min(scaleBox.y+scaleBox.height,zoomedViewportBox.y+zoomedViewportBox.height)
      -Math.max(scaleBox.y,zoomedViewportBox.y);
    expect(visibleWidth).toBeGreaterThan(scaleBox.width*.9);
    expect(visibleHeight).toBeGreaterThan(scaleBox.height*.9);

    await page.locator('#zoomFit').click();
    await expect(page.locator('#zoomRead')).toHaveText('100%');
    await page.locator('#tab2').click();
    await map.click({position:{x:mapBox.width*.55,y:mapBox.height*.45}});
    await expect(page.locator('#score')).toContainText('시도 1');
    expect(errors).toEqual([]);
  });
});

test.describe('desktop map',()=>{
  test.use({viewport:{width:1280,height:900},colorScheme:'dark'});

  test('renders without script or canvas errors',async({page})=>{
    const errors=collectErrors(page);
    const viewport=await waitForMap(page);
    const box=await viewport.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(700);
    expect(Math.abs(box.width-box.height)).toBeLessThan(3);
    expect(errors).toEqual([]);
  });
});
