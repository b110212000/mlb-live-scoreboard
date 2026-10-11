import {Component} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App.jsx';
import {applyTheme} from './theme.js';
// 外觀（深色 / 淺色）：同步網址列顏色；<head> 已先套用 data-theme。
applyTheme();
class AppBoundary extends Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error){console.error('Scoreboard UI failed',error)}
  render(){return this.state.failed?<main className="wrap"><section className="card settings-shell"><h1>畫面暫時無法載入</h1><button onClick={()=>location.reload()}>重新整理</button></section></main>:this.props.children}
}
createRoot(document.getElementById('root')).render(<AppBoundary><App/></AppBoundary>);
