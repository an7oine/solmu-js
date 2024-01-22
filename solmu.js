"use strict";

(function () {

  function Solmu() {

    this._debug = [
      //"dataPaivitetty",
      //"_paivitaElementti",
      //"vierasavain",
      //"puuttuvaRivi",
      //"puuttuvaViittaus",
      //"tuplarivi",
    ];

    this._ohitaPaivitys = [];

    /*
     * Odota, kunnes sivu on latautunut.
     */
    window.addEventListener(
      "DOMContentLoaded",
      function (e) {
        /*
         * Kuuntele kaikkia DOM-muutoksia ja reagoi niihin seuraavasti:
         *
         * - uusien [data-solmu]-elementtien sisältö päivitetään heti;
         *
         * - olemassaolevat elementit päivitetään aina, kun niiden
         *   [data-solmu*]-määreitä muutetaan.
         */
        this._muutostenTarkkailija = new MutationObserver(function (muutokset) {
          let muuttuneetElementit = muutokset.flatMap(function (muutos) {
            if (muutos.type === 'childList') {
              return Array.from(muutos.addedNodes).filter(function (el) {
                return el.nodeType == Node.ELEMENT_NODE;
              }).flatMap(function (el) {
                if (el.dataset.solmu)
                  return [el];
                let ulompiEl = el.closest("[data-solmu]");
                if (! ulompiEl)
                  return [];
                if (el.dataset.suhteellinenSolmu !== undefined)
                  // Suhteellinen solmu: päivitä ulompi.
                  return [ulompiEl];
                else if (this.sisemmatSolmut(
                  el,
                  "[data-suhteellinen-solmu]:not([data-solmu])",
                  ":not([data-suhteellinen-solmu]):not([data-solmu])"
                ).length > 0) {
                  // Sisältää suhteellisia solmuja: päivitä ulompi.
                  return [ulompiEl];
                }
                else
                  // Päivitetään mahdolliset sisemmät, absoluuttiset solmut.
                  return Array.from(this.sisemmatSolmut(el));
              }.bind(this));
            }
            else if (
              muutos.type === 'attributes'
              // Absoluuttinen solmu; suhteellinen polku tai
              // esitysmuodon lisätiedot muuttuvat: päivitetään.
              && muutos.target.matches("[data-solmu]")
              && (
                muutos.attributeName.startsWith("data-solmu")
                || muutos.attributeName === "data-suhteellinen-solmu"
              )
            )
              return [muutos.target];
            else
              return [];
          }.bind(this));

          // Järjestetään päivittyneet elementit: uloimmat ensin.
          muuttuneetElementit = Array.from(new Set(muuttuneetElementit));
          muuttuneetElementit.sort(function (el1, el2) {
            return el1.contains(el2)? -1 : el2.contains(el1)? 1 : 0;
          });

          // Päivitetään ne elementit, jotka eivät ole luettelossa
          // aiempien, ulompien elementtien sisällä.
          let elt = [];
          for (const el of muuttuneetElementit) {
            if (elt.filter(function (el0) {
              return el0?.contains(el);
            }).length == 0) {
              elt.push(el);
              this._paivitaElementti(el);
            }
          }
        }.bind(this));
        this._muutostenTarkkailija.observe(document, {
          attributes: true,
          childList: true,
          subtree: true
        });

        /*
         * Päivitä kaikki DOM:ssä jo olevat solmut.
         */
        for (let olemassaolevaSolmu of this.sisemmatSolmut(document)) {
          this._paivitaElementti(olemassaolevaSolmu);
        }
      }.bind(this),
      false
    );

    /*
     * Päivitä kaikki solmut aina, kun dokumentti vastaanottaa
     * `data-paivitetty`-sanoman.
     *
     * Mikäli kyse on sanomasta muotoa
     * `new CustomEvent("data-paivitetty", {detail: ["abc", "d-e", ...]})`,
     * päivitetään kuitenkin vain annetut solmut (`abc` ja `d-e`).
     */
    document.addEventListener(
      "data-paivitetty",
      function (e) {
        if (this._debug.includes("dataPaivitetty"))
          console.log("dataPaivitetty", e.detail, document?.data);
        if (! document)
          return;
        else if (Array.isArray(e.detail)) {
          for (let _solmu of e.detail)
            for (let el of solmu.sisemmatSolmut(
              document,
              `[data-solmu|=${_solmu}]`,
            ))
              this.paivitaElementti(el);
        }
        else
          this.paivitaElementti(document);
      }.bind(this),
      false
    );

    /*
     * Lisää kullekin DOM-elementille metodi `paivitaSolmu`.
     */
    Object.assign(Element.prototype, {
      paivitaSolmu: function () {
        solmu.paivitaElementti(this.closest("[data-solmu]"));
      }
    });
  }

  // Aja ennen dokumentin sulkemista?
  //this._muutostenTarkkailija.disconnect();

  Object.assign(Solmu.prototype, {
    /*
     * Sanakirja, joka koodaa elementtityypin (tagName) siihen
     * määreeseen, joka käsittää elementin sisällön.
     * Oletuksena käytetään määrettä `innerHTML`.
     */
    ElementinSisalto: [
      ["input, select, textarea, option", "value"],
    ],
    ElementinTulkinta: [
      ["input[type=checkbox]", "rastiRuudussa"],
    ],

    /*
     * Datan esitys ja tekstiesityksen tulkinta.
     */
    esitys: {},
    tulkinta: {},
    suodatus: {},

    /*
     * Poimi elementin sisältämät, hakuun (oletuksena [data-solmu])
     * täsmäävät elementit listana siten,
     * että haku pysähtyy kunkin löytyneen elementin kohdalla
     * (vain ne jälkeläiset tutkitaan, joihin ei-q-haku täsmää;
     * oletuksena nämä ovat samat, joihin q-haku ei täsmää).
     */
    sisemmatSolmut: function (el, q, ei_q) {
      q = q ?? "[data-solmu]";
      ei_q = ei_q ?? `:not(${q})`;
      let tasmaavat = Array.from(el.querySelectorAll(
        `:scope >${q}`
      ));
      for (let jalkelainen of el.querySelectorAll(
        `:scope >${ei_q}`
      )) {
        tasmaavat = tasmaavat.concat(
          this.sisemmatSolmut(jalkelainen, q, ei_q)
        );
      }
      return tasmaavat;
    },

    /*
     * Liitä suhteellinen solmu s2 (merkkijono) ulompaan,
     * absoluuttiseen solmuun s1 (luettelo).
     *
     * Palauta tulos luettelomuodossa.
     */
    yhdistettySolmu: function (s1, s2) {
      if (s2) {
        let tulos = Array.from(s1);
        // Kuoritaan ulomman elementin viittaamia,
        // sisimpiä solmuja tarvittaessa pois, yksi
        // kutakin alkavaa "-"-merkkiä kohti.
        while (s2.startsWith("-")) {
          if (! tulos.length)
            // Huomaa, että mikäli `---...` viittaa ulomman solmun
            // ulkopuolelle, sisemmälle elementille tulee `-`-alkuinen solmu.
            break;
          tulos.pop();
          s2 = s2.substring(1);
        }
        // Lisätään sisemmän elementin viittama suhteellinen
        // polku tuloksena saatuun solmuun.
        if (s2)
          return tulos.concat(s2.split("-"));
        else
          return tulos;
      }
      else
        return s1;
    },

    /*
     * Hae tietoa annetusta datasta (oletus `document.data`) annetulla
     * avaimella.
     *
     * Tavuviiva tulkitaan sisemmän sanakirjan
     * (jonka odotetaan olevan olemassa) avaimeksi,
     * so. `sanakirja-avain` hakee arvon 42 seuraavasta datasta:
     *
     * {sanakirja: {avain: 42}}
     *
     * Mikäli taulukon (`Array`) sisältä poimitaan indeksi, tuotetaan
     * kyseinen rivi. Mikäli poimitaan muu avain, tuotetaan
     * uusi taulukko poimien annettu avain kultakin riviltä.
     */
    poimiData: function (avain, data) {
      if (avain.startsWith("-"))
        return undefined;
      data = data ?? document.data;
      let avaimet = (avain ?? "").split("-");
      for (let _avain of avaimet) {
        if (!_avain || ! data)
          break;
        else if (Array.isArray(data)) {
          if (! isNaN(_avain))
            data = data[_avain];
          else
            data = data.flatMap(function (alkio) {
              return alkio? alkio[_avain] : undefined;
            });
        }
        else if (_avain === "*")
          data = Object.values(data);
        else
          data = data[_avain];
      }
      return data;
    },

    /*
     * Päivitä `document.data` annetulla avaimella ja arvolla.
     *
     * Tavuviiva tulkitaan sisemmän sanakirjan
     * (joka luodaan tarvittaessa) avaimeksi,
     * so. `sanakirja-avain` = 42 tuottaa tuloksena:
     * {sanakirja: {avain: 42}}
     *
     * Avaimen osana [] viittaa uuteen alkioon ulommassa taulukossa,
     * joka luodaan tarvittaessa. Huomaa, että kukin ajo samalla
     * avaimella luo oman, uuden alkionsa samaan taulukkoon.
     * Esim. `sanakirjat-[]-avain` = 42 tuottaa:
     * {sanakirjat: [{avain: 42}]}
     */
    asetaData: function (avain, arvo, data) {
      data = data ?? document.data;
      let avaimet = avain.split("-"), _avain;
      let _edellinenData = data, _edellinenAvain;
      for (_avain of avaimet.slice(0, -1)) {
        if (!_avain || ! data)
          return;
        else if (_avain === "[]") {
          if (! Array.isArray(data))
            data = _edellinenData[_edellinenAvain] = [];
          (_edellinenData = data).push(data = {});
          _edellinenAvain = 0;
        }
        else if (Array.isArray(data)) {
          _edellinenData = data;
          _edellinenAvain = _avain;
          if (! isNaN(_avain))
            data = data[_avain];
          else
            data = data.flatMap(function (alkio) {
              return alkio? alkio[_avain] : undefined;
            });
        }
        else {
          _edellinenData = data;
          _edellinenAvain = _avain;
          data = data[_avain] ?? (data[_avain] = {});
        }
      }
      if (avaimet[avaimet.length - 1] === "[]") {
        if (! Array.isArray(data))
          data = _edellinenData[_edellinenAvain] = [];
        data.push(arvo);
      }
      else {
        let _avain = avaimet[avaimet.length - 1];
        if (data && _avain)
          data[_avain] = arvo;
      }
    },

    /*
     * Muodosta tekstiesitys datalle elementtikohtaisen
     * esitysmuotofunktio(ide)n perusteella.
     *
     * Oletuksena käytetään funktiota:
     * - `suhteellinen` silloin, kun kyse on isäntäelementistä;
     * - `sisalto` muuten.
     *
     * Mikäli [data-solmu-esitys] on tyhjä merkkijono, poistutaan.
     *
     * Kutsutaan lopuksi `sisalto`-esitysfunktiota, ellei se sisälly
     * elementille määritettyyn esitykseen ja:
     * - elementillä on [data-solmu-sisalto] tai
     * - elementti sisältyy this.ElementinSisalto-luetteloon tai
     * - elementti ei sisällä toisia elementtejä.
     */
    esitaData: function (el, data) {
      let arvo = data;
      let esitykset;
      if (el.dataset.solmuEsitys === "")
        return;
      else if (el.dataset.solmuEsitys)
        esitykset = el.dataset.solmuEsitys.split(", ");
      else if (el.childElementCount)
        esitykset = ["suhteellinen"];
      else
        esitykset = ["sisalto"];
      for (let esitys of esitykset) {
        if (this.esitys[esitys]) {
          try {
            arvo = this.esitys[esitys].bind(this.esitys)(el, arvo);
          }
          catch (e) {
            console.log(`${el.dataset.solmu}: esitys ${esitys} on virheellinen.`);
            return;
          }
        }
        else if (esitys) {
          console.log(`${el.dataset.solmu}: esitys ${esitys} puuttuu.`);
          return;
        }
      }
      if (esitykset.includes("sisalto"))
        ;
      else if (
        el.dataset.solmuSisalto
        || this.ElementinSisalto.filter(function ([tyyppi, _sisalto]) {
          return el.matches(tyyppi);
        }).length > 0
        || ! el.childElementCount
      )
        this.esitys.sisalto(el, arvo);
    },

    /*
     * Tulkitse tekstiesitys loogisena arvona.
     */
    tulkitseData: function (el, data) {
      let tulkinta = el.dataset.solmuTulkinta;
      if (tulkinta === undefined) {
        for (const [tyyppi, _tulkinta] of window.solmu.ElementinTulkinta)
          if (el.matches(tyyppi)) {
            tulkinta = _tulkinta;
            break;
          }
      }
      if (tulkinta && this.tulkinta[tulkinta])
        return this.tulkinta[tulkinta].bind(this.tulkinta)(el, data);
      else if (tulkinta)
        console.log(`${el.dataset.solmu}: tulkinta ${tulkinta} puuttuu.`);
      return data;
    },

    /*
     * Suodata annetun taulukon rivit.
     */
    suodataData: function (el, data) {
      let arvo = data;
      if (el.dataset.solmuSuodatus) {
        for (let suodatus of el.dataset.solmuSuodatus.split(", ")) {
          if (this.suodatus[suodatus]) {
            if (! this.suodatus[suodatus].bind(this.suodatus)(data, el))
              return false;
          }
          else if (suodatus) {
            console.log(`${el.dataset.solmu}: suodatus ${suodatus} puuttuu.`);
            return true;
          }
        }
      }
      return true;
    },

    /*
     * Päivitä yksittäisen elementin sisältö.
     *
     * Oletuksena sijoitetaan elementtityyppikohtaiseen
     * tai `innerHTML`-määreeseen.
     * Mikäli `[data-solmu-sisalto]` on määritetty,
     * sijoitetaan siihen.
     */
    _paivitaElementti: function (el) {
      if (this._ohitaPaivitys.includes(el)) {
        setTimeout(function () {
          this._ohitaPaivitys.pop(el);
        }.bind(this), 0);
        return;
      }
      if (this._debug.includes("_paivitaElementti"))
        console.log(`Päivitetään ${el.dataset.solmu}`, el);
      this.esitaData(
        el,
        this.poimiData(el.dataset.solmu)
      );
    },

    /*
     * Päivitä elementti ja sen lähimmät jälkeläiset.
     */
    paivitaElementti: function (el) {
      if (el.dataset?.solmu !== undefined)
        this._paivitaElementti(el);
      for (let jalkelainen of this.sisemmatSolmut(el))
        this._paivitaElementti(jalkelainen);
    },

    ohitaPaivitys: function (el) {
      this._ohitaPaivitys.push(el);
    }
  });

  /*
   *
   * VAKIOESITYKSET.
   *
   */

  Object.assign(Solmu.prototype.esitys, {

    /*
     * Aseta elementin sisältö.
     */
    sisalto: function (el, arvo) {
      let sisalto = el.dataset.solmuSisalto;
      if (sisalto === undefined) {
        for (const [tyyppi, _sisalto] of window.solmu.ElementinSisalto)
          if (el.matches(tyyppi)) {
            sisalto = _sisalto;
            break;
          }
        if (sisalto)
          ;
        else if (! [
          "string", "number", "undefined"
        ].includes(typeof arvo))
          return;
        else if (el.childElementCount)
          return;
        else
          sisalto = "textContent";
      }
      if (sisalto.startsWith("on") || sisalto.startsWith("data-"))
        el.setAttribute(sisalto, arvo)
      else if (el.matches("select[multiple]") && sisalto === "value")
        for (let option of el.querySelectorAll("option"))
          if (arvo?.includes?.(option.value))
            option.setAttribute("selected", true);
          else
            option.removeAttribute("selected");
      else if (sisalto)
        el[sisalto] = arvo ?? "";
      return arvo;
    },

    /*
     * Taulukkomuotoinen sisältö. Elementin sisältämää `.riviaihio`-elementtiä
     * monistetaan kutakin syöteriviä kohti. Näin luodun elementin solmuksi
     * asetetaan alkuperäisen elementin solmu + rivin indeksi.
     */
    rivitetty: function (el, arvo) {
      if (arvo === undefined) {
        return arvo;
      }
      let riviaihio = (
        window.solmu.sisemmatSolmut(
          el, ".riviaihio"
        )[0] ?? window.solmu.sisemmatSolmut(
          el, "template"
        )[0]?.content?.querySelector?.(
          ".riviaihio"
        )
      );
      if (! riviaihio) {
        console.log(`${el.dataset.solmu}: riviaihiota ei löydy.`);
        return arvo;
      };
      let olemassaolevatRivit = Object.fromEntries(
        Array.from(el.children)
        .filter(function (rivi) { return rivi.classList.contains("rivi"); })
        .map(function (rivi) { return [rivi.dataset.solmu, rivi]; })
      );
      let sijoitusElementinJalkeen = Object.values(
        olemassaolevatRivit
      ).slice(-1).pop() ?? window.solmu.sisemmatSolmut(
        el, ".riviaihio"
      )[0] ?? window.solmu.sisemmatSolmut(
        el, "template"
      )[0];

      // Mikäli vierasavain on määritetty, haetaan kukin rivisolmu
      // sen kautta.
      // Vierasavaimen viittaman datan on oltava sanakirjamuotoista.
      let vierasavain = el.dataset.solmuVierasavain;

      let rivisolmut = [];

      for (let [avain, rivi] of Object.entries(arvo ?? {})) {
        if (rivi == undefined) {
          if (window.solmu._debug.includes("puuttuvaRivi"))
            console.log(`${el.dataset.solmu}: rivi puuttuu.`);
          continue;
        }
        let rivisolmu = [el.dataset.solmu, avain].join("-");
        if (vierasavain) {
          rivisolmu = [vierasavain, rivi.id].join("-");
          rivi = window.solmu.poimiData(rivisolmu);
          if (! rivi) {
            if (window.solmu._debug.includes("puuttuvaViittaus"))
              console.log(`${el.dataset.solmu}: viitattua tietuetta ${arvo} ei löydy.`);
            continue;
          }
        }

        if (! window.solmu.suodataData(el, rivi))
          continue;

        if (rivisolmut.includes(rivisolmu)) {
          if (window.solmu._debug.includes("tuplarivi"))
            console.log(`Rivi ${rivisolmu} on kahdesti aineistossa!`);
          continue;
        }
        rivisolmut.push(rivisolmu);

        let riviEl = olemassaolevatRivit[rivisolmu];
        if (riviEl !== undefined) {
          // Päivitä olemassaoleva rivielementti;
          // siirrä se viimeiseksi.
          window.solmu.paivitaElementti(riviEl);
          delete olemassaolevatRivit[rivisolmu];
        }
        else {
          // Luo uusi rivielementti, lisää se viimeiseksi.
          riviEl = riviaihio.cloneNode(true);
          riviEl.classList.remove("riviaihio");
          riviEl.classList.add("rivi");
          riviEl.setAttribute("data-solmu", rivisolmu);
        }
        if (sijoitusElementinJalkeen)
          sijoitusElementinJalkeen.insertAdjacentElement(
            "afterend", riviEl
          );
        else
          el.insertAdjacentElement("afterbegin", riviEl);
        sijoitusElementinJalkeen = riviEl;
      }
      for (let poistuvaRivi of Object.values(olemassaolevatRivit)) {
        // Poista aiempi rivielementti.
        poistuvaRivi.remove();
      }
      return arvo;
    },

    /*
     * Suhteellinen, ulomman solmun viittauksesta riippuva sisältö.
     *
     * Mikäli [data-solmu-suhteellinen-viittaus] on määritelty,
     * käytetään tätä suhteellisena viittauksena ULOMPAAN solmuun.
     *
     * Mikäli elementin solmu alkaa "-", ohitetaan.
     *
     * Elementin sisältämät [data-suhteellinen-solmu]-jälkeläiset käydään
     * läpi ja alkuperäisen elementin solmu lisätään niiden alkuun:
     * - mikäli `[data-suhteellinen-solmu]` on tyhjä, käytetään alkuperäistä
     *   solmua sellaisenaan
     * - mikäli se alkaa viivoilla, kutakin viivaa kohti poistetaan
     *   yksi alkuperäisen solmun hierarkiataso
     * - muut, viivoin erotetut hierarkiatasot lisätään tähän tulokseen
     */
    suhteellinen: function (el, arvo) {
      let solmu = el.dataset.solmu;
      if (el.dataset.solmuSuhteellinenViittaus !== undefined)
        solmu = el.parentElement.closest(
          "[data-solmu]"
        ).dataset.solmu;
      if (solmu.startsWith("-"))
        solmu = undefined;
      else if (solmu)
        solmu = solmu.split("-");
      else
        solmu = [];

      // Mikäli käsillä olevalle elementille on määritetty
      // [data-solmu-suhteellinen-viittaus], huomioidaan tämä.
      if (el.dataset.solmuSuhteellinenViittaus)
        solmu = window.solmu.yhdistettySolmu(
          solmu,
          el.dataset.solmuSuhteellinenViittaus
        );

      // Mikäli vierasavain on määritetty, haetaan suhteellinen data
      // sen kautta.
      // Vierasavaimen viittaman datan on oltava sanakirjamuotoista.
      let vierasavain = el.dataset.solmuVierasavain;
      if (solmu !== undefined && vierasavain !== undefined) {
        if (! arvo)
          return;
        solmu = vierasavain.split("-").concat([arvo]);
        arvo = window.solmu.poimiData(solmu.join("-"));
      }

      // Mikäli ulomman elementin solmu on kelvollinen
      // (ei "-"-alkuinen),
      // käydään läpi kaikki sen välittömät
      // [data-suhteellinen-solmu]-jälkeläiset.
      // Ohitetaan mahdolliset [data-solmu]-jälkeläiset.
      if (solmu !== undefined) {
        for (let jalkelainen of window.solmu.sisemmatSolmut(
          el,
          "[data-suhteellinen-solmu]",
          ":not([data-suhteellinen-solmu]):not([data-solmu])"
        )) {
          jalkelainen.setAttribute(
            "data-solmu",
            window.solmu.yhdistettySolmu(
              solmu,
              jalkelainen.dataset.suhteellinenSolmu
            ).join("-")
          );
        }
      }

      // Käydään läpi kaikki välittömät
      // [data-solmu]-jälkeläiset, poislukien yllä läpikäydyt
      // [data-suhteellinen-solmu][data-solmu]-jälkeläiset.
      for (let jalkelainen of window.solmu.sisemmatSolmut(
        el,
        "[data-solmu]:not([data-suhteellinen-solmu])",
        ":not([data-suhteellinen-solmu]):not([data-solmu])"
      )) {
        window.solmu.paivitaElementti(jalkelainen);
      }
      return arvo;
    },
  });

  Object.assign(Solmu.prototype.tulkinta, {
    /*
     * Tulkitse `input[type=checkbox]`-tyyppinen syöte true/false-muodossa.
     */
    rastiRuudussa: function (el, arvo) {
      return el.checked;
    }
  });

  window.solmu = new Solmu();

})();
