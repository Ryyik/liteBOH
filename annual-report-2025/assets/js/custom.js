/*global $, jQuery, alert*/
$(function () {
  /*==========================================
    动态视口高度设置 (修复移动设备上的100vh问题)
  ===========================================*/
  function setViewportHeight() {
    var vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", vh + "px");
  }

  // 初始设置
  setViewportHeight();

  // 防抖函数
  function debounce(func, wait) {
    var timeout;
    return function () {
      var context = this,
        args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        func.apply(context, args);
      }, wait);
    };
  }

  // 窗口大小改变时更新 (带防抖)
  window.addEventListener("resize", debounce(setViewportHeight, 100));

  // 方向改变时更新 (移动设备)
  window.addEventListener("orientationchange", setViewportHeight);

  // ========================================================================= //
  //  AOS Animate
  // ========================================================================= //

  AOS.init({
    duration: 3000,
  });
  // ========================================================================= //
  //  Navigation
  // ========================================================================= //
  var navigation = new TimelineLite({
    paused: true,
    reversed: true,
  });
  navigation
    .to("#navigationWrap", 0.5, {
      opacity: 1,
      display: "block",
    })
    .to(
      ".navbar",
      0.3,
      {
        opacity: 0,
      },
      "-=0.1"
    )
    .to(
      ".close",
      0.3,
      {
        display: "block",
        opacity: 1,
      },
      "-=0.1"
    )
    .from(".menu", 0.5, {
      opacity: 0,
      y: 30,
    });

  $(".navbar, .close").click(function () {
    navigation.reversed() ? navigation.play() : navigation.reverse();
  });

  // ========================================================================= //
  //   Overlay Effect Trigger
  // ========================================================================= //

  $(
    ".nav-styletwo .navbar .navbar-collapse .navbar-nav .nav-item .nav-link"
  ).on("click", function () {
    "use strict";
    $(".overlay-effect").addClass("animate-up").removeClass("animate-down");
  });

  $(".lightbox-wrapper .lightbox-close .close-btn").on("click", function () {
    "use strict";
    var myParent = $(this);

    $(".overlay-effect").addClass("animate-down").removeClass("animate-up");

    setTimeout(function () {
      myParent.parent().parent().parent().removeClass("fadeIn");
    }, 600);

    setTimeout(function () {
      $(".page__style").removeClass("fadeIn");
    }, 600);
  });

  // ========================================================================= //
  //   skillsProgress
  // ========================================================================= //

  var lang = {
    html: "100%",
    css: "90%",
    javascript: "70%",
    php: "55%",
    angular: "65%",
  };

  var multiply = 4;

  $.each(lang, function (language, pourcent) {
    var delay = 700;

    setTimeout(function () {
      $("#" + language + "-pourcent").html(pourcent);
    }, delay * multiply);

    multiply++;
  });

  // ========================================================================= //
  //   Blog
  // ========================================================================= //
  $(function () {
    var image = $(".full-blog-item").find("img").attr("src");

    $(".full-blog-item .img-item").mouseover(function () {
      var cureentImage = $(this).attr("data-image");

      $(this).parent().parent().parent().find("img").attr("src", cureentImage);

      $(".full-blog-item img").css("opacity", "1");

      $(".full-blog-item .img-fixed ").mouseout(function () {
        $(".full-blog-item img").css("opacity", "0.5");
      });
    });
  });

  // ========================================================================= //
  //   Ow Carousem Tesimonials
  // ========================================================================= //
  ("use strict");
  $(".owl-carousel").owlCarousel({
    loop: true,
    margin: 10,
    nav: true,
    dotsContainer: ".dots",
    autoplay: false,
    autoplayTimeout: 7000,
    smartSpeed: 800,
    responsive: {
      0: {
        items: 1,
        dots: false,
      },
      600: {
        items: 1,
        dots: false,
      },
      767: {
        items: 1,
        dots: false,
      },
      768: {
        items: 2,
        dots: false,
      },
      1000: {
        items: 2,
        dots: false,
      },
    },
  });

  // ========================================================================= //
  //   Maps
  // ========================================================================= //

  if (jQuery("#map").length > 0) {
    var latlog = jQuery("#map").data("latlog"),
      popupTextit = jQuery("#map").data("popuptext"),
      map = L.map("map").setView(latlog, 15);
    L.tileLayer(jQuery("#map").data("map-back"), {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      format: "png",
    }).addTo(map);
    var greenIcon = L.icon({
      iconUrl: jQuery("#map").data("popupicon"),
      iconSize: [40, 40],
      popupAnchor: [0, -26],
    });
    L.marker(latlog, {
      icon: greenIcon,
    })
      .addTo(map)
      .bindPopup(popupTextit)
      .openPopup();
  }

  // ========================================================================= //
  //  Animate Page
  // ========================================================================= //

  $(".btn_nav").click(function () {
    setTimeout(function () {
      $(".page__style").removeClass("fadeIn");
    }, 500);
  });

  /* #Abouts */
  $(".header__section-link").click(function () {
    setTimeout(function () {
      $(".full__header").addClass("fadeIn");
    }, 500);
  });

  /* #Abouts */
  $(".about__section-link").click(function () {
    setTimeout(function () {
      $(".full__about").addClass("fadeIn");
    }, 500);
  });

  /* #Resume */
  $(".resume__section-link").click(function () {
    setTimeout(function () {
      $(".full__resume").addClass("fadeIn");
    }, 500);
  });

  /* #portfolio */
  $(".portfolio__section-link").click(function () {
    setTimeout(function () {
      $(".full__portfolio").addClass("fadeIn");
    }, 500);
  });

  /* #journal */
  $(".news__section-link").click(function () {
    setTimeout(function () {
      $(".full__blog").addClass("fadeIn");
    }, 500);
  });

  /* #Contact */
  $(".contact__section-link").click(function () {
    setTimeout(function () {
      $(".full__contact").addClass("fadeIn");
    }, 500);
  });
});

// ========================================================================= //
//   Contact Form
// ========================================================================= //

$(".contact-form").on("submit", function () {
  "use strict";
  var myForm = $(this),
    data = {};

  myForm.find("[name]").each(function () {
    var that = $(this),
      name = that.attr("name"),
      value = that.val();

    data[name] = value;
  });

  $.ajax({
    url: myForm.attr("action"),
    type: myForm.attr("method"),
    data: data,
    success: function (response) {
      if (response === "success") {
        $(".contact-form").find(".form-message").addClass("success");
        $(".form-message span").text("Message Sent!");
      } else {
        $(".contact-form").find(".form-message").addClass("error");
        $(".form-message span").text("Error Sending!");
      }
    },
  });

  return false;
});
