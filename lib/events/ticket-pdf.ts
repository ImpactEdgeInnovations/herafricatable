import {readFile} from "node:fs/promises";
import path from "node:path";
import {PDFDocument, rgb, type PDFFont} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

export type EventTicket = {
  event_id:string; event_slug:string; event_title:string; starts_at:string; ends_at:string; timezone:string;
  venue:string; guest_name:string; ticket_type:string; booking_reference:string;
  host_name:string; organisation_name:string; qr_payload:string; manual_code:string;
  issued_at:string; checked_in_at:string|null; event_ended:boolean;
  arrival_info?:string; networking?:{starts_at:string;ends_at:string;minutes:number}|null;
};
let fontBytes:Promise<Buffer>|undefined;
const green=rgb(.13,.29,.23),ink=rgb(.13,.19,.16),muted=rgb(.36,.41,.38),ivory=rgb(.98,.97,.94),gold=rgb(.7,.57,.32);

function lines(value:string,font:PDFFont,size:number,width:number,max:number){
  const supported=new Set(font.getCharacterSet());
  const safe=Array.from(String(value??"").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g," ").slice(0,2000)).map(c=>supported.has(c.codePointAt(0)!)?c:"?").join("");
  const rows:string[]=[];let row="";
  for(const word of safe.split(/\s+/)){
    if(!word)continue;
    const candidate=row?`${row} ${word}`:word;
    if(font.widthOfTextAtSize(candidate,size)<=width){row=candidate;continue;}
    if(row){rows.push(row);row="";}
    for(const chunk of Array.from(word)){
      if(font.widthOfTextAtSize(row+chunk,size)>width&&row){rows.push(row.trim());row="";}
      row+=chunk;
    }
  }
  if(row.trim())rows.push(row.trim());
  if(rows.length>max){rows.length=max;let last=rows[max-1];while(font.widthOfTextAtSize(last+"...",size)>width)last=last.slice(0,-1);rows[max-1]=last.trim()+"...";}
  return rows;
}
export function ticketFilename(slug:string){return `her-africa-table-${slug.replace(/[^a-z0-9-]/gi,"-").slice(0,100)||"event"}-ticket.pdf`;}

export async function renderEventTicketPdf(ticket:EventTicket):Promise<Uint8Array>{
  if(!/^[A-Z0-9]{10}$/.test(ticket.manual_code)||!ticket.qr_payload.startsWith(`HATCHECKIN:${ticket.event_id}:`))throw Error("Invalid event ticket");
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  fontBytes??=readFile(path.join(process.cwd(),"assets/tickets/NotoSans-Regular.ttf"));
  const font=await pdf.embedFont(await fontBytes,{subset:true});
  // A fixed issue time makes retries byte-stable for email idempotency.
  const issued=new Date(ticket.issued_at);if(!Number.isFinite(issued.getTime()))throw Error("Invalid ticket issue time");
  pdf.setTitle("Her Africa Table - private event ticket");pdf.setAuthor("Her Africa Table");pdf.setCreationDate(issued);pdf.setModificationDate(issued);
  const page=pdf.addPage([595,842]);page.drawRectangle({x:0,y:0,width:595,height:842,color:ivory});
  page.drawRectangle({x:0,y:746,width:595,height:96,color:green});
  const write=(text:string,x:number,y:number,size=11,color=ink,width=499,max=1)=>{
    const rows=lines(text,font,size,width,max);rows.forEach((row,i)=>page.drawText(row,{x,y:y-i*(size+4),size,font,color}));return rows.length*(size+4);
  };
  write("HER AFRICA TABLE",48,799,18,rgb(1,1,1));write("YOUR PRIVATE EVENT TICKET",48,774,9,rgb(.85,.9,.85));
  write(ticket.event_ended?"EVENT ENDED":ticket.checked_in_at?"CHECKED IN":"CONFIRMED",401,792,10,rgb(.9,.84,.65),145,2);
  let titleSize=24;
  while(titleSize>16&&font.widthOfTextAtSize(ticket.event_title.replace(/[\u0000-\u001f]/g," ").slice(0,500),titleSize)>499*3)titleSize--;
  const titleHeight=write(ticket.event_title,48,704,titleSize,ink,499,3);
  const host=[ticket.host_name,ticket.organisation_name].filter(Boolean).join(" · ");
  write(`Hosted by ${host}`,48,704-titleHeight-10,11,muted,499,3);
  page.drawLine({start:{x:48,y:558},end:{x:547,y:558},thickness:1,color:gold});
  const date=new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"long",year:"numeric",timeZone:ticket.timezone}).format(new Date(ticket.starts_at));
  const time=(value:string)=>new Intl.DateTimeFormat("en-KE",{hour:"numeric",minute:"2-digit",timeZone:ticket.timezone}).format(new Date(value));
  write("WHEN",48,535,9,muted);write(date,48,514,13);write(`${time(ticket.starts_at)} - ${time(ticket.ends_at)} · ${ticket.timezone}`,48,493,10,muted,245,2);
  write("WHERE",320,535,9,muted);write(ticket.venue,320,514,12,ink,227,3);
  page.drawRectangle({x:48,y:354,width:499,height:102,color:rgb(1,1,1)});
  write("GUEST",64,434,9,muted);write(ticket.guest_name,64,411,16,ink,285,2);
  write("TICKET",378,434,9,muted);write(ticket.ticket_type,378,411,11,ink,150,3);
  write(`Booking reference: ${ticket.booking_reference}`,48,331,10,muted,499,2);
  const qr=await pdf.embedPng(await QRCode.toBuffer(ticket.qr_payload,{type:"png",width:600,margin:4,errorCorrectionLevel:"M",color:{dark:"#153c2d",light:"#ffffff"}}));
  page.drawImage(qr,{x:197.5,y:111,width:200,height:200});
  if(ticket.networking){write("NETWORKING",48,272,9,muted,140);write(`${time(ticket.networking.starts_at)} - ${time(ticket.networking.ends_at)}`,48,251,11,green,140,2);write(`${ticket.networking.minutes}-minute introductions. Optional; check in first.`,48,215,9,muted,140,4);}
  write("BACKUP ENTRY CODE",48,93,9,muted,499);write(ticket.manual_code,48,68,20,green);
  write("One guest. One event.",320,88,10,ink,227);write("Keep this ticket and its code private.",320,70,9,muted,227);
  page.drawLine({start:{x:48,y:49},end:{x:547,y:49},thickness:.5,color:gold});
  write("Show your QR at the welcome desk. Entry is checked against your current booking.",48,30,8,muted,499);
  return pdf.save({useObjectStreams:false});
}
