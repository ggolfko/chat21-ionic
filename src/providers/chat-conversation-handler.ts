import { Injectable } from '@angular/core';
import 'rxjs/add/operator/map';
import { Events } from 'ionic-angular';
// firebase
import * as firebase from 'firebase/app';
// models
import { MessageModel } from '../models/message';
import { UserModel } from '../models/user';
// services
//import { ChatManager } from './chat-manager/chat-manager';
// utils
import { TYPE_MSG_IMAGE, MSG_STATUS_RECEIVED, CLIENT_BROWSER } from '../utils/constants';
import { compareValues, urlify, searchIndexInArrayForUid, setHeaderDate, conversationMessagesRef } from '../utils/utils';
import { TranslateService } from '@ngx-translate/core';


//import { TranslateModule } from '@ngx-translate/core';
//import { TranslateService } from '@ngx-translate/core';
//import { CustomTranslateService } from './translate-service';

@Injectable()
export class ChatConversationHandler {
  private urlNodeFirebase: string;
  private recipientId: string;
  private recipientFullname: string;
  private tenant: string;
  private loggedUser: UserModel;
  private senderId: string;
  public conversationWith: string;
  public messages: any[];
  public messagesRef: firebase.database.Query;
  public listSubsriptions: any[];
  public attributes: any;
  public CLIENT_BROWSER: string;
  //public events: Events;

  constructor(
    public events: Events,
    private translate: TranslateService
  ) {
    // console.log("CONSTRUCTOR ChatConversationHandlerProvider");
    console.log("CONSTRUCTOR ChatConversationHandlerProvider", translate);
    //this.tenant = this.chatManager.getTenant();
    //this.loggedUser = this.chatManager.getLoggedUser();
    //this.events = new Events();
    this.listSubsriptions = [];
    this.CLIENT_BROWSER = navigator.userAgent;
  }
  /**
   * inizializzo conversation handler
   * @param recipientId 
   * @param recipientFullName 
   */
  initWithRecipient(recipientId,recipientFullName, loggedUser, tenant) {
    this.loggedUser = loggedUser;
    this.tenant = tenant;
    this.recipientId = recipientId;
    this.recipientFullname = recipientFullName;
    this.senderId = this.loggedUser.uid;
    this.conversationWith = recipientId;
    this.messages = [];
    this.attributes = this.setAttributes();
    
  }

  setAttributes(): any {
    let attributes: any = JSON.parse(sessionStorage.getItem('attributes'));
    if (!attributes || attributes === 'undefined') {
        attributes = {
            client: this.CLIENT_BROWSER,
            sourcePage: location.href,
            userEmail: this.loggedUser.email,
            userName: this.loggedUser.fullname
        };
        console.log('>>>>>>>>>>>>>> setAttributes: ', JSON.stringify(attributes));
        sessionStorage.setItem('attributes', JSON.stringify(attributes));
    }
    return attributes;
}
  /**
   * mi connetto al nodo messages
   * recupero gli ultimi 100 messaggi
   * creo la reference
   * mi sottoscrivo a change, removed, added
   */
  connect() {
    var lastDate: string = "";
    const that = this;
    this.urlNodeFirebase = conversationMessagesRef(this.tenant, this.loggedUser.uid);
    this.urlNodeFirebase = this.urlNodeFirebase+this.conversationWith;
    const firebaseMessages = firebase.database().ref(this.urlNodeFirebase);
    this.messagesRef = firebaseMessages.orderByChild('timestamp').limitToLast(100);

    //// AGGIUNTA MESSAGGIO ////
    this.messagesRef.on("child_added", function (childSnapshot) {
      //console.log("child_added *****", childSnapshot.key);
      const itemMsg = childSnapshot.val();
      // imposto il giorno del messaggio per visualizzare o nascondere l'header data
      let calcolaData = setHeaderDate(itemMsg['timestamp'], lastDate);
      if (calcolaData != null) {
        lastDate = calcolaData;
      }
      // controllo fatto per i gruppi da rifattorizzare
      (!itemMsg.sender_fullname || itemMsg.sender_fullname == 'undefined') ? itemMsg.sender_fullname = itemMsg.sender : itemMsg.sender_fullname;
      // bonifico messaggio da url
      let messageText = itemMsg['text'];
      if (itemMsg['type'] == 'text') {
        //messageText = urlify(itemMsg['text']);
      }

      if (itemMsg['metadata']) {
        const index = searchIndexInArrayForUid(that.messages, itemMsg['metadata'].uid);
        if (index > -1) {
          that.messages.splice(index, 1);
        }
      }

      // creo oggetto messaggio e lo aggiungo all'array dei messaggi
      const msg = new MessageModel(childSnapshot.key, itemMsg['language'], itemMsg['recipient'], itemMsg['recipient_fullname'], itemMsg['sender'], itemMsg['sender_fullname'], itemMsg['status'], itemMsg['metadata'], messageText, itemMsg['timestamp'], calcolaData, itemMsg['type'], itemMsg['attributes'], itemMsg['channel_type']);
      console.log("child_added *****", itemMsg['timestamp'], that.messages, msg);

      if (msg.attributes && msg.attributes.subtype && (msg.attributes.subtype === 'info' || msg.attributes.subtype === 'info/support')) {
        that.translateInfoSupportMessages(msg);
      }

      that.messages.push(msg);
      that.messages.sort(compareValues('timestamp', 'asc'));

      // aggiorno stato messaggio
      // questo stato indica che è stato consegnato al client e NON che è stato letto
      that.setStatusMessage(childSnapshot, that.conversationWith);

      console.log("msg.sender ***** " + msg.sender + " that.loggedUser.uid:::" + that.loggedUser.uid);
      if (msg.sender === that.loggedUser.uid) {
        that.events.publish('doScroll');
      }
      // pubblico messaggio - sottoscritto in dettaglio conversazione
      //console.log("publish:: ", 'listMessages:added-'+that.conversationWith, that.events);
      //that.events.publish('listMessages:added-'+that.conversationWith, that.conversationWith, msg);
    })

    //// SUBSRIBE CHANGE ////
    this.messagesRef.on("child_changed", function(childSnapshot) {
      const itemMsg = childSnapshot.val();
      // imposto il giorno del messaggio per visualizzare o nascondere l'header data
      const calcolaData = setHeaderDate(itemMsg['timestamp'], lastDate);
      if (calcolaData != null) {
        lastDate = calcolaData;
      }
      // controllo fatto per i gruppi da rifattorizzare
      (!itemMsg.sender_fullname || itemMsg.sender_fullname == 'undefined') ? itemMsg.sender_fullname = itemMsg.sender : itemMsg.sender_fullname;
      // bonifico messaggio da url
      let messageText = itemMsg['text'];
      if (itemMsg['type'] == 'text') {
        //messageText = urlify(itemMsg['text']);
      }
      // creo oggetto messaggio e lo aggiungo all'array dei messaggi
      const msg = new MessageModel(childSnapshot.key, itemMsg['language'], itemMsg['recipient'], itemMsg['recipient_fullname'], itemMsg['sender'], itemMsg['sender_fullname'], itemMsg['status'], itemMsg['metadata'], messageText, itemMsg['timestamp'], calcolaData, itemMsg['type'], itemMsg['attributes'], itemMsg['channel_type']);
      const index = searchIndexInArrayForUid(that.messages, childSnapshot.key);

      if (msg.attributes && msg.attributes.subtype && (msg.attributes.subtype === 'info' || msg.attributes.subtype === 'info/support')) {
        that.translateInfoSupportMessages(msg);
      }
      
      that.messages.splice(index, 1, msg);
      // aggiorno stato messaggio
      // questo stato indica che è stato consegnato al client e NON che è stato letto
      that.setStatusMessage(childSnapshot, that.conversationWith);

      if (that.isSender(msg, that.loggedUser)) {
        that.events.publish('doScroll');
      }
      // pubblico messaggio - sottoscritto in dettaglio conversazione
      //that.events.publish('listMessages:changed-'+that.conversationWith, that.conversationWith, that.messages);
      //that.events.publish('listMessages:changed-'+that.conversationWith, that.conversationWith, msg);
    });

    this.messagesRef.on("child_removed", function(childSnapshot) {
      // al momento non previsto!!!
      const index = searchIndexInArrayForUid(that.messages, childSnapshot.key);
      // controllo superfluo sarà sempre maggiore
      if (index > -1) {
        that.messages.splice(index, 1);
        //this.events.publish('conversations:update-'+that.conversationWith, that.messages);
      }

      // if(!this.isSender(msg)){
      //   that.events.publish('doScroll');
      // }
    });
  } 
   
  private translateInfoSupportMessages(message: MessageModel) {
    // console.log("ChatConversationHandler::translateInfoSupportMessages::message:", message);

    // check if the message has attributes, attributes.subtype and these values
    if (message.attributes && message.attributes.subtype && (message.attributes.subtype === 'info' || message.attributes.subtype === 'info/support')) {
      
      // check if the message attributes has parameters and it is of the "MEMBER_JOINED_GROUP" type
      // [BEGIN MEMBER_JOINED_GROUP]
      if ((message.attributes.messagelabel && message.attributes.messagelabel.parameters && message.attributes.messagelabel.key === 'MEMBER_JOINED_GROUP')) {
        
        var subject;
        var verb;
        var complement;
        
        if (message.attributes.messagelabel.parameters.member_id === this.loggedUser.uid) {
          // logged user has been added to the group
          subject = this.translate.get('INFO_SUPPORT_USER_ADDED_SUBJECT')['value'];
          verb = this.translate.get('INFO_SUPPORT_USER_ADDED_YOU_VERB')['value'];
          complement = this.translate.get('INFO_SUPPORT_USER_ADDED_COMPLEMENT')['value'];
        } else {
          if (message.attributes.messagelabel.parameters.fullname) {
            // other user has been added to the group (and he has a fullname)
            subject = message.attributes.messagelabel.parameters.fullname;
            verb = this.translate.get('INFO_SUPPORT_USER_ADDED_VERB')['value'];
            complement = this.translate.get('INFO_SUPPORT_USER_ADDED_COMPLEMENT')['value'];
          } else {
            // other user has been added to the group (and he has not a fullname, so use hes useruid)
            subject = message.attributes.messagelabel.parameters.member_id;
            verb = this.translate.get('INFO_SUPPORT_USER_ADDED_VERB')['value'];
            complement = this.translate.get('INFO_SUPPORT_USER_ADDED_COMPLEMENT')['value'];
          }
        }

        // perform translation
        this.translate.get('INFO_SUPPORT_USER_ADDED_MESSAGE', {
          'subject': subject,
          'verb': verb,
          'complement': complement
        }).subscribe((res: string) => {
          message.text = res;
        });

      } // [END MEMBER_JOINED_GROUP]
    }
   

  }


  /**
   * arriorno lo stato del messaggio
   * questo stato indica che è stato consegnato al client e NON che è stato letto
   * se il messaggio NON è stato inviato da loggedUser AGGIORNO stato a 200
   * @param item 
   * @param conversationWith 
   */
  setStatusMessage(item,conversationWith){
    if(item.val()['status'] < MSG_STATUS_RECEIVED){
      //const tenant = this.chatManager.getTenant();
      //const loggedUser = this.chatManager.getLoggedUser();
      let msg = item.val();
      if (msg.sender != this.loggedUser.uid && msg.status < MSG_STATUS_RECEIVED){
        const urlNodeMessagesUpdate  = '/apps/'+this.tenant+'/users/'+this.loggedUser.uid+'/messages/'+conversationWith+"/"+item.key;
        console.log("AGGIORNO STATO MESSAGGIO", urlNodeMessagesUpdate);
        firebase.database().ref(urlNodeMessagesUpdate).update({ status: MSG_STATUS_RECEIVED });
      }
    }
  }
  /**
   * controllo se il messaggio è stato inviato da loggerUser
   * richiamato dalla pagina elenco messaggi della conversazione
   * @param message 
   */
  isSender(message, currentUser) {
    //const currentUser = this.loggedUser;//this.chatManager.getLoggedUser();
    //console.log("isSender::::: ", message.sender, currentUser.uid);
    if (currentUser){
      if (message.sender == currentUser.uid) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * bonifico url in testo messaggio
   * recupero time attuale
   * recupero lingua app
   * recupero sender_fullname e recipient_fullname
   * aggiungo messaggio alla reference
   * @param msg 
   * @param conversationWith 
   * @param conversationWithDetailFullname 
   */
  sendMessage(msg, type, metadata, conversationWith, conversationWithDetailFullname, channel_type) {
    const that = this;
    (!channel_type || channel_type == 'undefined')?channel_type='direct':channel_type;
    console.log('messages: ',  this.messages);
    console.log("SEND MESSAGE: ", msg, channel_type);
    // console.log("messageTextArea:: ",this.messageTextArea['_elementRef'].nativeElement.getElementsByTagName('textarea')[0].style);
    // const messageString = urlify(msg);
    const now: Date = new Date();
    const timestamp = now.valueOf();
    const language = document.documentElement.lang;
    const sender_fullname = this.loggedUser.fullname;
    const recipient_fullname = conversationWithDetailFullname;
    const dateSendingMessage = setHeaderDate(timestamp);
    let firebaseMessagesCustomUid = firebase.database().ref(this.urlNodeFirebase);
    const message = new MessageModel(
      '',
      language,
      conversationWith,
      recipient_fullname,
      this.loggedUser.uid,
      sender_fullname,
      '',
      metadata,
      msg,
      timestamp,
      dateSendingMessage,
      type,
      this.attributes,
      channel_type
    ); 

    console.log('messaggio **************',message);
    //firebaseMessages.push(message);
    const messageRef = firebaseMessagesCustomUid.push();
    const key = messageRef.key;
    message.uid = key;
    console.log('messageRef: ', messageRef, key);
    messageRef.set(message, function( error ){
      // Callback comes here
      if (error) {
        // cambio lo stato in rosso: invio nn riuscito!!!
        message.status = '-100';
        console.log('ERRORE', error);
      } else {
        //that.checkWritingMessages();
        message.status = '150';
        console.log('OK MSG INVIATO CON SUCCESSO AL SERVER', message);
      }
      console.log('****** changed *****', that.messages);
    });

  }


  updateMetadataMessage(uid, metadata){
    metadata.status = true;
    const message = {
      metadata: metadata
    };
    let firebaseMessages = firebase.database().ref(this.urlNodeFirebase+uid);
    firebaseMessages.set(message);
  }


  // // se è una immagine e la ha inviata l'utente corrente
  // if (type == TYPE_MSG_IMAGE) {
  //   const index = this.messages.findIndex(i => i.uid === metadata.uid);
  //   console.log("trovato mesg", this.messages[index].uid, metadata.uid);
  //   if(index>-1){
  //     this.messages.splice(index, 1);
  //   }
  // } 

  /**
   * dispose reference della conversazione
   */
  dispose() {
    this.messagesRef.off();
  }


  unsubscribe(key){
    console.log("unsubscribe: ", key);
    this.listSubsriptions.forEach(sub => {
      console.log("unsubscribe: ", sub.uid, key);
      if(sub.uid === key){
        console.log("unsubscribe: ", sub.uid, key);
        sub.unsubscribe(key, null);
        return;
      }
      
    });
    
  }

}