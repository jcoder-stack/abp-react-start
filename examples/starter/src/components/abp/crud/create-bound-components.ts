import { useRef } from "react";

/** 组件身份跨渲染稳定 + 接线值读活：绑定成员的唯一产地。create 只在首渲染调用一次，
 * 闭包经 read() 拿当前接线值。StrictMode 双调用下 create 可能跑两次，须无副作用。 */
export function useBoundComponents<W, T>(wiring: W, create: (read: () => W) => T): T {
  const wiringRef = useRef(wiring);
  wiringRef.current = wiring;
  const componentsRef = useRef<T | null>(null);
  if (componentsRef.current === null) {
    const read = () => wiringRef.current;
    componentsRef.current = create(read);
  }
  return componentsRef.current;
}
